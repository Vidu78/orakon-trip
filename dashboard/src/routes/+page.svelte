<script lang="ts">
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import { API_URL, TRIP_ID } from '$lib/config';
  import type { DeviceSummary, FeedEntry, Telemetry, Trip, TripStatus } from '$lib/types';

  let trip = $state<Trip | null>(null);
  let telemetry = $state<Telemetry | null>(null);
  let devices = $state<DeviceSummary[]>([]);
  let feed = $state<FeedEntry[]>([]);
  let connected = $state(false);

  let mapEl: HTMLDivElement;
  // Leaflet is loaded dynamically (client-only).
  let map: import('leaflet').Map | undefined;
  let marker: import('leaflet').CircleMarker | undefined;
  let L: typeof import('leaflet') | undefined;

  const eta = $derived.by(() => {
    if (!telemetry || !trip) return '—';
    const km = haversineKm(telemetry.gps, trip.end);
    if (telemetry.speed <= 0) return 'paused';
    return `${Math.round((km / telemetry.speed) * 60)} min`;
  });

  const kmLeft = $derived.by(() =>
    telemetry && trip ? haversineKm(telemetry.gps, trip.end).toFixed(0) : '—',
  );

  async function control(status: TripStatus) {
    await fetch(`${API_URL}/trips/${TRIP_ID}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  function pushFeed(type: string, detail: string) {
    feed = [{ type, detail, ts: new Date().toISOString() }, ...feed].slice(0, 25);
  }

  function updateTelemetry(t: Telemetry) {
    telemetry = t;
    if (map && L && t?.gps) {
      const pos: [number, number] = [t.gps.lat, t.gps.lng];
      if (!marker) {
        marker = L.circleMarker(pos, {
          radius: 9,
          color: '#ffcc33',
          fillColor: '#ffcc33',
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
      } else {
        marker.setLatLng(pos);
      }
      map.panTo(pos);
    }
  }

  function drawRoute() {
    if (!map || !L || !trip?.route?.length) return;
    const pts = trip.route.map((p) => [p.lat, p.lng] as [number, number]);
    L.polyline(pts, { color: '#4f8cff', weight: 4, opacity: 0.85 }).addTo(map);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }

  function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  onMount(() => {
    let socket: import('socket.io-client').Socket | undefined;

    (async () => {
      L = (await import('leaflet')).default;
      map = L.map(mapEl).setView([44, 11], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Initial trip + audit.
      try {
        const res = await fetch(`${API_URL}/trips/${TRIP_ID}`);
        if (res.ok) {
          const data = (await res.json()) as { trip: Trip; events: FeedEntry[] };
          trip = data.trip;
          drawRoute();
        }
      } catch {
        /* API may be down; the live channel will fill in */
      }

      const { io } = await import('socket.io-client');
      socket = io(API_URL, { transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        connected = true;
        socket?.emit('trip:join', {
          tripId: TRIP_ID,
          deviceId: 'web-dashboard',
          deviceType: 'laptop',
        });
      });
      socket.on('disconnect', () => (connected = false));
      socket.on('trip:snapshot', (snap: { trip: Trip | null; telemetry: Telemetry | null; devices: DeviceSummary[] }) => {
        if (snap.trip) {
          trip = snap.trip;
          drawRoute();
        }
        if (snap.telemetry) updateTelemetry(snap.telemetry);
        devices = snap.devices ?? [];
      });
      socket.on('trip:state', (t: Trip) => {
        trip = t;
        pushFeed('trip.updated', t.status);
      });
      socket.on('telemetry', ({ telemetry: t }: { telemetry: Telemetry }) => updateTelemetry(t));
      socket.on('devices:update', (d: DeviceSummary[]) => (devices = d));
      socket.on('intent:suggestion', (s: { action: string; reason: string }) =>
        pushFeed('intent', `${s.action} — ${s.reason}`),
      );
      socket.on('device:action', (a: { action: string; intent?: string }) =>
        pushFeed('action', `${a.action}${a.intent ? ` (${a.intent})` : ''}`),
      );
    })();

    return () => {
      socket?.disconnect();
      map?.remove();
    };
  });
</script>

<svelte:head><title>Orakon Trip — Dashboard</title></svelte:head>

<div class="app">
  <header>
    <div class="brand">
      <span class="logo">◎</span>
      <div>
        <h1>Orakon Trip</h1>
        <p>Cross-device trip continuity</p>
      </div>
    </div>
    <span class="status" class:on={connected}>{connected ? 'live' : 'offline'}</span>
  </header>

  <main>
    <div class="map" bind:this={mapEl}></div>

    <aside>
      <section class="card">
        <h2>Trip</h2>
        <div class="row"><span>ID</span><b>{trip?.id ?? TRIP_ID}</b></div>
        <div class="row">
          <span>State</span>
          <b class="badge {trip?.status ?? 'unknown'}">{trip?.status ?? '—'}</b>
        </div>
        <div class="row"><span>ETA</span><b>{eta}</b></div>
        <div class="row"><span>Distance left</span><b>{kmLeft} km</b></div>
        <div class="row">
          <span>Battery</span>
          <b>{telemetry?.battery ?? trip?.batteryEst ?? '—'}%</b>
        </div>
        <div class="row"><span>Speed</span><b>{telemetry?.speed ?? 0} km/h</b></div>
      </section>

      <section class="card">
        <h2>Controls</h2>
        <div class="controls">
          <button onclick={() => control('paused')}>Pause</button>
          <button onclick={() => control('running')}>Resume</button>
          <button onclick={() => control('redirected')}>Redirect</button>
        </div>
      </section>

      <section class="card">
        <h2>Devices ({devices.length})</h2>
        <div class="devices">
          {#each devices as d (d.deviceId)}
            <span class="chip">{d.deviceType}</span>
          {:else}
            <span class="muted">No devices connected</span>
          {/each}
        </div>
      </section>

      <section class="card feed">
        <h2>Activity</h2>
        {#each feed as e (e.ts + e.type)}
          <div class="event">
            <span class="etype">{e.type}</span>
            <span class="edetail">{e.detail}</span>
            <span class="ets">{new Date(e.ts).toLocaleTimeString()}</span>
          </div>
        {:else}
          <span class="muted">Waiting for events…</span>
        {/each}
      </section>
    </aside>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0b1020;
    color: #e7ecf5;
    font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid #1c2540;
    background: #0d1428;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    font-size: 26px;
    color: #4f8cff;
  }
  h1 {
    margin: 0;
    font-size: 17px;
  }
  header p {
    margin: 0;
    font-size: 12px;
    color: #8a96b3;
  }
  .status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #2a1722;
    color: #ff7a90;
    border: 1px solid #4a2030;
  }
  .status.on {
    background: #11241a;
    color: #57e08a;
    border-color: #1f4a31;
  }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 340px;
    min-height: 0;
  }
  .map {
    height: 100%;
    background: #0a0f1f;
  }
  aside {
    overflow-y: auto;
    padding: 14px;
    background: #0d1428;
    border-left: 1px solid #1c2540;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card {
    background: #121a33;
    border: 1px solid #1c2540;
    border-radius: 12px;
    padding: 14px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8a96b3;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .row span {
    color: #8a96b3;
  }
  .badge {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    text-transform: capitalize;
  }
  .badge.running { background: #11241a; color: #57e08a; }
  .badge.paused { background: #2a2412; color: #e0c257; }
  .badge.redirected { background: #1a1f33; color: #4f8cff; }
  .badge.completed { background: #1c2540; color: #b7c2dd; }
  .badge.unknown { background: #1c2540; color: #8a96b3; }
  .controls {
    display: flex;
    gap: 8px;
  }
  button {
    flex: 1;
    padding: 9px;
    border-radius: 9px;
    border: 1px solid #2a3a66;
    background: #16213f;
    color: #e7ecf5;
    cursor: pointer;
    font-size: 13px;
  }
  button:hover {
    background: #1d2c52;
  }
  .devices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    padding: 4px 12px;
    border-radius: 999px;
    background: #16213f;
    border: 1px solid #2a3a66;
    text-transform: capitalize;
  }
  .feed {
    flex: 1;
  }
  .event {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #19223e;
    font-size: 12px;
  }
  .etype {
    color: #4f8cff;
  }
  .ets {
    color: #6b7796;
  }
  .muted {
    color: #6b7796;
  }
  @media (max-width: 720px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 45vh 1fr;
    }
    aside {
      border-left: none;
      border-top: 1px solid #1c2540;
    }
  }
</style>
