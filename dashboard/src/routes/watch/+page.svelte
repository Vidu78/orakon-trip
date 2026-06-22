<script lang="ts">
  import { onMount } from 'svelte';
  import { API_URL, TRIP_ID } from '$lib/config';
  import type { GeoPoint, Telemetry, Trip, TripStatus } from '$lib/types';
  import { nextChargeStop, type NextStop } from '$lib/chargePlan';

  const deviceId = 'web-watch';
  let connected = $state(false);
  let trip = $state<Trip | null>(null);
  let telemetry = $state<Telemetry | null>(null);
  let alert = $state<{ action: string; reason: string } | null>(null);
  let accepted = $state(false);
  let dismissed = $state(false);
  let socket: import('socket.io-client').Socket | undefined;

  function haversineKm(a: GeoPoint, b: GeoPoint): number {
    const R = 6371;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  const kmLeft = $derived.by(() =>
    telemetry?.gps && trip ? haversineKm(telemetry.gps, trip.end) : null,
  );
  const etaMin = $derived.by(() => {
    if (kmLeft == null || !telemetry) return null;
    const spd = telemetry.speed > 0 ? telemetry.speed : 100;
    return Math.round((kmLeft / spd) * 60);
  });
  const battery = $derived(telemetry?.battery ?? trip?.batteryEst ?? null);

  // Next charge stop along the route, snapped to the nearest of the 142k
  // chargers. Recomputed off telemetry but throttled — nearbyChargers scans the
  // whole network, too heavy to run on every ~1s tick.
  let nextStop = $state<NextStop | null>(null);
  let lastPlanAt = 0;
  let planning = false;
  $effect(() => {
    const t = telemetry;
    const tr = trip;
    if (!tr || tr.status === 'completed') {
      nextStop = null;
      return;
    }
    const now = Date.now();
    if (planning || now - lastPlanAt < 5000) return;
    planning = true;
    lastPlanAt = now;
    nextChargeStop(tr, t)
      .then((s) => (nextStop = s))
      .catch(() => {})
      .finally(() => (planning = false));
  });

  function fmtEta(m: number): string {
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;
  }
  function statusLabel(s?: TripStatus): string {
    return { running: 'in viaggio', paused: 'in pausa', redirected: 'deviato', completed: 'arrivato' }[s ?? 'running'] ?? '—';
  }
  function batColor(b: number): string {
    return b >= 50 ? '#34d399' : b >= 20 ? '#facc15' : '#f87171';
  }

  // Battery ring geometry.
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const dash = $derived(battery != null ? CIRC * (1 - Math.max(0, Math.min(100, battery)) / 100) : CIRC);

  const INTENT_LABELS: Record<string, string> = {
    charger: '⚡ Ricarica consigliata',
    route: '🗺️ Nuova rotta suggerita',
    pause: '⏸ Sosta consigliata',
  };

  function accept() {
    if (!alert) return;
    socket?.emit('device:action', { tripId: TRIP_ID, deviceId, action: 'accept', intent: alert.action });
    accepted = true;
    alert = null;
    setTimeout(() => (accepted = false), 2500);
  }

  function dismiss() {
    if (!alert) return;
    socket?.emit('device:action', { tripId: TRIP_ID, deviceId, action: 'dismiss', intent: alert.action });
    dismissed = true;
    alert = null;
    setTimeout(() => (dismissed = false), 1500);
  }

  onMount(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/trips/${TRIP_ID}`);
        if (res.ok) trip = ((await res.json()) as { trip: Trip }).trip;
      } catch {
        /* the snapshot will fill it in */
      }
      const { io } = await import('socket.io-client');
      socket = io(API_URL, { transports: ['websocket', 'polling'] });
      socket.on('connect', () => {
        connected = true;
        socket?.emit('trip:join', { tripId: TRIP_ID, deviceId, deviceType: 'watch' });
      });
      socket.on('disconnect', () => (connected = false));
      socket.on('trip:snapshot', (snap: { trip: Trip | null; telemetry: Telemetry | null }) => {
        if (snap.trip) trip = snap.trip;
        if (snap.telemetry) telemetry = snap.telemetry;
      });
      socket.on('telemetry', ({ telemetry: t }: { telemetry: Telemetry }) => (telemetry = t));
      socket.on('trip:state', (t: Trip) => (trip = t));
      socket.on('intent:suggestion', (s: { action: string; reason: string }) => {
        alert = s; // show all intent types as an actionable card
      });
    })();
    return () => socket?.disconnect();
  });
</script>

<svelte:head><title>Orakon ⌚</title></svelte:head>

<div class="stage">
  <div class="watch">
    <div class="top">
      <span class="dot" class:on={connected}></span>
      <span class="state">{statusLabel(trip?.status)}</span>
    </div>

    <div class="ring">
      <svg viewBox="0 0 120 120">
        <circle class="track" cx="60" cy="60" r={R} />
        <circle
          class="val"
          cx="60" cy="60" r={R}
          stroke={battery != null ? batColor(battery) : '#46506b'}
          stroke-dasharray={CIRC}
          stroke-dashoffset={dash}
        />
      </svg>
      <div class="center">
        <div class="bat" style="color:{battery != null ? batColor(battery) : '#8a96b3'}">
          {battery != null ? Math.round(battery) : '—'}<small>%</small>
        </div>
        <div class="lbl">batteria</div>
      </div>
    </div>

    <div class="metrics">
      <div><b>{etaMin != null ? fmtEta(etaMin) : '—'}</b><span>arrivo</span></div>
      <div><b>{kmLeft != null ? kmLeft.toFixed(0) : '—'}</b><span>km</span></div>
      <div><b>{telemetry?.speed ?? 0}</b><span>km/h</span></div>
    </div>

    {#if alert}
      <div class="alert">
        <div class="atxt">{INTENT_LABELS[alert.action] ?? '💡 Suggerimento'}<br /><small>{alert.reason}</small></div>
        <div class="abtns">
          <button class="ok" onclick={accept}>✓</button>
          <button class="no" onclick={dismiss}>✕</button>
        </div>
      </div>
    {:else if accepted}
      <div class="done">✓ Inviato all'auto</div>
    {:else if dismissed}
      <div class="done" style="color:#8a96b3">✕ Ignorato</div>
    {:else if nextStop?.charger}
      <div class="stop">
        <div class="slabel">⚡ Prossima sosta</div>
        <div class="sname">{nextStop.charger.name}</div>
        <div class="smeta">
          tra {nextStop.kmToStop} km{#if nextStop.etaMin != null} · ~{fmtEta(nextStop.etaMin)}{/if}{#if nextStop.charger.powerKW} · {nextStop.charger.powerKW} kW{/if}
        </div>
      </div>
    {:else if nextStop}
      <div class="stop warn">
        <div class="slabel">⚡ Ricarica necessaria</div>
        <div class="smeta">nessuna colonnina entro 40 km · tra {nextStop.kmToStop} km</div>
      </div>
    {:else}
      <div class="trip">{trip?.start?.label ?? '—'} → {trip?.end?.label ?? '—'}</div>
    {/if}
  </div>
</div>

<style>
  :global(body) { margin: 0; background: #000; }
  .stage {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 30%, #14233a, #000 70%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
  }
  .watch {
    width: 320px;
    height: 320px;
    border-radius: 64px;
    background: #0b1120;
    border: 6px solid #1c2540;
    box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    color: #e7ecf5;
    padding: 18px 22px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: #8a96b3;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #f87171; }
  .dot.on { background: #34d399; box-shadow: 0 0 8px #34d399; }
  .ring { position: relative; width: 150px; height: 150px; margin: 6px 0 2px; }
  .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 10; stroke-linecap: round; }
  .ring .track { stroke: #1c2540; }
  .ring .val { transition: stroke-dashoffset 0.5s ease, stroke 0.3s; }
  .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .bat { font-size: 40px; font-weight: 800; line-height: 1; }
  .bat small { font-size: 18px; font-weight: 700; opacity: 0.7; }
  .lbl { font-size: 11px; color: #8a96b3; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  .metrics { display: flex; gap: 18px; margin-top: 4px; }
  .metrics div { display: flex; flex-direction: column; align-items: center; }
  .metrics b { font-size: 18px; font-weight: 700; }
  .metrics span { font-size: 10px; color: #8a96b3; text-transform: uppercase; letter-spacing: 0.06em; }
  .trip { margin-top: 12px; font-size: 12px; color: #8a96b3; }
  .stop {
    margin-top: 10px;
    width: 100%;
    background: #10233a;
    border: 1px solid #2dd4bf44;
    border-radius: 14px;
    padding: 8px 12px;
    box-sizing: border-box;
    text-align: center;
  }
  .stop.warn { background: #2a2412; border-color: #e0c25755; }
  .slabel { font-size: 11px; color: #5eead4; text-transform: uppercase; letter-spacing: 0.06em; }
  .stop.warn .slabel { color: #f1d98a; }
  .sname { font-size: 14px; font-weight: 700; color: #e7ecf5; margin-top: 2px; line-height: 1.2; }
  .smeta { font-size: 11px; color: #8a96b3; margin-top: 2px; }
  .alert {
    margin-top: 10px;
    width: 100%;
    background: #2a2412;
    border: 1px solid #e0c25755;
    border-radius: 14px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .atxt { flex: 1; font-size: 12px; color: #f1d98a; line-height: 1.3; }
  .atxt small { color: #b9a86a; }
  .abtns { display: flex; gap: 6px; }
  .alert button { border: none; border-radius: 9px; padding: 7px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .alert .ok { background: #34d399; color: #053226; }
  .alert .no { background: #1c2540; color: #b7c2dd; }
  .done { margin-top: 12px; font-size: 13px; color: #34d399; font-weight: 600; }
</style>
