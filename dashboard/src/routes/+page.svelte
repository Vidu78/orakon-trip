<script lang="ts">
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import { API_URL, TRIP_ID } from '$lib/config';
  import type { Charger, ChargePlan, DeviceSummary, FeedEntry, GeoPoint, Telemetry, Trip, TripStatus, Vehicle } from '$lib/types';

  let activeTripId = $state(TRIP_ID);
  let trip = $state<Trip | null>(null);
  let telemetry = $state<Telemetry | null>(null);
  let devices = $state<DeviceSummary[]>([]);
  let feed = $state<FeedEntry[]>([]);
  let connected = $state(false);

  // Create-trip form.
  let startInput = $state('Milano');
  let endInput = $state('Roma');
  let batteryInput = $state(80);
  let creating = $state(false);
  let createError = $state('');
  let created = $state<{ id: string; status: string } | null>(null);
  let chargers = $state<Charger[]>([]);
  let chargePlan = $state<ChargePlan | null>(null);
  let vehicles = $state<Vehicle[]>([]);
  let selectedModel = $state('');

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | undefined;
  let marker: import('leaflet').CircleMarker | undefined;
  let routeLine: import('leaflet').Polyline | undefined;
  let chargerLayer: import('leaflet').LayerGroup | undefined;
  let stopMarker: import('leaflet').CircleMarker | undefined;
  let L: typeof import('leaflet') | undefined;
  let socket: import('socket.io-client').Socket | undefined;

  // A few well-known cities so the text inputs can be names, not just coords.
  const CITIES: Record<string, GeoPoint> = {
    milano: { lat: 45.4642, lng: 9.19, label: 'Milano' },
    roma: { lat: 41.9028, lng: 12.4964, label: 'Roma' },
    torino: { lat: 45.0703, lng: 7.6869, label: 'Torino' },
    bologna: { lat: 44.4949, lng: 11.3426, label: 'Bologna' },
    firenze: { lat: 43.7696, lng: 11.2558, label: 'Firenze' },
    napoli: { lat: 40.8518, lng: 14.2681, label: 'Napoli' },
    genova: { lat: 44.4056, lng: 8.9463, label: 'Genova' },
    venezia: { lat: 45.4408, lng: 12.3155, label: 'Venezia' },
    bari: { lat: 41.1171, lng: 16.8719, label: 'Bari' },
    palermo: { lat: 38.1157, lng: 13.3615, label: 'Palermo' },
  };

  /** Accept a known city name or "lat,lng" → GeoPoint. */
  function parsePoint(input: string): GeoPoint | null {
    const s = input.trim();
    if (!s) return null;
    const coords = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) return { lat: parseFloat(coords[1]), lng: parseFloat(coords[2]), label: s };
    return CITIES[s.toLowerCase()] ? { ...CITIES[s.toLowerCase()] } : null;
  }

  const eta = $derived.by(() => {
    if (!telemetry || !trip) return '—';
    const km = haversineKm(telemetry.gps, trip.end);
    if (telemetry.speed <= 0) return 'paused';
    return `${Math.round((km / telemetry.speed) * 60)} min`;
  });
  const kmLeft = $derived.by(() =>
    telemetry && trip ? haversineKm(telemetry.gps, trip.end).toFixed(0) : '—',
  );

  async function createTrip() {
    createError = '';
    created = null;
    const start = parsePoint(startInput);
    const end = parsePoint(endInput);
    if (!start || !end) {
      createError = 'Usa una città nota (es. Milano) o coordinate "lat,lng".';
      return;
    }
    creating = true;
    try {
      const res = await fetch(`${API_URL}/trips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start, end, route: [], batteryEst: Number(batteryInput) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const t = (await res.json()) as Trip;
      created = { id: t.id, status: t.status };
      await switchTrip(t.id);
    } catch (e) {
      createError = `Errore: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      creating = false;
    }
  }

  /** Point the whole dashboard at a (newly created) trip. */
  async function switchTrip(tripId: string) {
    activeTripId = tripId;
    telemetry = null;
    feed = [];
    marker?.remove();
    marker = undefined;
    await loadTrip(tripId);
    socket?.emit('trip:join', { tripId, deviceId: 'web-dashboard', deviceType: 'laptop' });
  }

  async function loadTrip(tripId: string) {
    try {
      const res = await fetch(`${API_URL}/trips/${tripId}`);
      if (res.ok) {
        const data = (await res.json()) as { trip: Trip };
        trip = data.trip;
        drawRoute();
      }
    } catch {
      /* live channel will fill in */
    }
  }

  async function control(status: TripStatus) {
    await fetch(`${API_URL}/trips/${activeTripId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async function findChargers() {
    const center = telemetry?.gps ?? trip?.end ?? null;
    if (!center) return;
    try {
      const res = await fetch(`${API_URL}/chargers?lat=${center.lat}&lng=${center.lng}&radius=15&max=12`);
      if (!res.ok) return;
      const data = (await res.json()) as { chargers: Charger[] };
      chargers = data.chargers ?? [];
      renderChargers();
      if (chargers.length && map) {
        const pts = chargers.map((c) => [c.lat, c.lng] as [number, number]);
        pts.push([center.lat, center.lng]);
        map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
      }
    } catch {
      /* provider unavailable — degrade silently */
    }
  }

  function renderChargers() {
    if (!map || !L) return;
    if (!chargerLayer) chargerLayer = L.layerGroup().addTo(map);
    chargerLayer.clearLayers();
    for (const c of chargers) {
      const color =
        c.status === 'operational' ? '#57e08a' : c.status === 'non-operational' ? '#ff7a90' : '#8a96b3';
      L.circleMarker([c.lat, c.lng], {
        radius: 7,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<b>${c.name}</b><br/>${c.powerKW ?? '?'} kW · ${c.status}` +
            (c.distanceKm != null ? `<br/>${c.distanceKm.toFixed(1)} km` : '') +
            (c.cost ? `<br/>${c.cost}` : ''),
        )
        .addTo(chargerLayer);
    }
  }

  async function loadVehicles() {
    try {
      const res = await fetch(`${API_URL}/vehicles`);
      if (!res.ok) return;
      const data = (await res.json()) as { vehicles: Vehicle[] };
      vehicles = data.vehicles ?? [];
    } catch {
      /* optional — plan works with default range */
    }
  }

  async function planCharge() {
    const battery = telemetry?.battery ?? trip?.batteryEst;
    try {
      const params = new URLSearchParams();
      if (battery != null) params.set('battery', String(battery));
      if (selectedModel) params.set('model', selectedModel);
      const qs = params.toString();
      const res = await fetch(`${API_URL}/trips/${activeTripId}/charge-plan${qs ? `?${qs}` : ''}`);
      if (!res.ok) return;
      chargePlan = (await res.json()) as ChargePlan;
      const stop = chargePlan.stop;
      if (stop) {
        // Show the candidate chargers near the suggested stop, not just the ring.
        chargers = stop.alternatives?.length ? stop.alternatives : stop.charger ? [stop.charger] : [];
        renderChargers();
        map?.setView([stop.point.lat, stop.point.lng], 11);
      }
      renderStop();
    } catch {
      /* ignore */
    }
  }

  function renderStop() {
    if (!map || !L) return;
    stopMarker?.remove();
    stopMarker = undefined;
    const stop = chargePlan?.stop;
    if (!stop) return;
    stopMarker = L.circleMarker([stop.point.lat, stop.point.lng], {
      radius: 12,
      color: '#ffcc33',
      fillColor: 'transparent',
      weight: 3,
    }).addTo(map);
    const c = stop.charger;
    stopMarker
      .bindPopup(
        `<b>Ricarica consigliata</b><br/>~${stop.atKm} km · batteria ~${stop.batteryAtStopPct}%` +
          (c ? `<br/>${c.name} · ${c.powerKW ?? '?'} kW` : '<br/>nessuna colonnina trovata qui'),
      )
      .openPopup();
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
    routeLine?.remove();
    const pts = trip.route.map((p) => [p.lat, p.lng] as [number, number]);
    routeLine = L.polyline(pts, { color: '#4f8cff', weight: 4, opacity: 0.85 }).addTo(map);
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
    (async () => {
      L = (await import('leaflet')).default;
      map = L.map(mapEl).setView([44, 11], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      await loadTrip(activeTripId);
      loadVehicles();

      const { io } = await import('socket.io-client');
      socket = io(API_URL, { transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        connected = true;
        socket?.emit('trip:join', {
          tripId: activeTripId,
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
      socket.on('intent:suggestion', (s: { action: string; reason: string }) => {
        pushFeed('intent', `${s.action} — ${s.reason}`);
        if (s.action === 'charger') findChargers();
      });
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

<datalist id="cities">
  <option value="Milano"></option>
  <option value="Roma"></option>
  <option value="Torino"></option>
  <option value="Bologna"></option>
  <option value="Firenze"></option>
  <option value="Napoli"></option>
  <option value="Genova"></option>
  <option value="Venezia"></option>
  <option value="Bari"></option>
  <option value="Palermo"></option>
</datalist>

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
        <h2>Create trip</h2>
        <label>Start
          <input list="cities" bind:value={startInput} placeholder="Milano or 45.46,9.19" />
        </label>
        <label>End
          <input list="cities" bind:value={endInput} placeholder="Roma or 41.90,12.49" />
        </label>
        <label>Battery est. %
          <input type="number" min="0" max="100" bind:value={batteryInput} />
        </label>
        <button class="primary" onclick={createTrip} disabled={creating}>
          {creating ? 'Creating…' : 'Create trip'}
        </button>
        {#if created}
          <p class="ok">✓ Trip <b>{created.id}</b> — {created.status}</p>
        {/if}
        {#if createError}
          <p class="err">{createError}</p>
        {/if}
      </section>

      <section class="card">
        <h2>Trip</h2>
        <div class="row"><span>ID</span><b>{trip?.id ?? activeTripId}</b></div>
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
        <h2>Chargers</h2>
        <label>Veicolo (consumo reale)
          <select bind:value={selectedModel}>
            <option value="">Generico (~300 km)</option>
            {#each vehicles as v (v.id)}
              <option value={v.id}>{v.name}</option>
            {/each}
          </select>
        </label>
        <div class="controls">
          <button class="primary" onclick={findChargers}>Find nearby</button>
          <button class="primary" onclick={planCharge}>Plan charging</button>
        </div>
        {#if chargePlan}
          {#if chargePlan.vehicle}
            <p class="muted note">
              {chargePlan.vehicle.name}: autonomia reale ~{chargePlan.rangeKm} km
              (WLTP {chargePlan.vehicle.wltpRangeKm} km · {chargePlan.vehicle.consumptionWhKm} Wh/km · ×{chargePlan.vehicle.realWorldFactor}).
            </p>
          {/if}
          {#if chargePlan.needsCharge && chargePlan.stop}
            <p class="warn note">
              ⚡ Ricarica a ~{chargePlan.stop.atKm} km — {chargePlan.stop.charger?.name ?? 'colonnina'}
              ({chargePlan.stop.charger?.powerKW ?? '?'}kW). Senza sosta arrivi ~{chargePlan.batteryAtArrivalPct}%.
            </p>
          {:else}
            <p class="ok note">✓ Arrivi con ~{chargePlan.batteryAtArrivalPct}% — nessuna ricarica necessaria ({chargePlan.totalKm} km).</p>
          {/if}
          <p class="muted note">Stima lineare (range {chargePlan.rangeKm} km, riserva {chargePlan.reservePct}%) — non un calcolo EV reale.</p>
        {/if}
        {#if chargers.length}
          <div class="chargers">
            {#each chargers.slice(0, 5) as c (c.id)}
              <div class="charger">
                <span class="dot {c.status}"></span>
                <span class="cname">{c.name}</span>
                <span class="cmeta">{c.powerKW ?? '?'}kW{c.distanceKm != null ? ` · ${c.distanceKm.toFixed(1)}km` : ''}</span>
              </div>
            {/each}
          </div>
          <p class="muted note">Fonte: OpenChargeMap (stato operativo, non disponibilità live)</p>
        {/if}
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
  label {
    display: block;
    font-size: 12px;
    color: #8a96b3;
    margin-bottom: 8px;
  }
  input,
  select {
    width: 100%;
    box-sizing: border-box;
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid #2a3a66;
    background: #0d1428;
    color: #e7ecf5;
    font-size: 13px;
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
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  button.primary {
    width: 100%;
    margin-top: 4px;
    background: #2a4ea0;
    border-color: #3a64c8;
  }
  button.primary:hover {
    background: #335fc0;
  }
  .ok {
    margin: 10px 0 0;
    font-size: 12px;
    color: #57e08a;
  }
  .err {
    margin: 10px 0 0;
    font-size: 12px;
    color: #ff7a90;
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
  .chargers {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }
  .charger {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }
  .charger .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8a96b3;
  }
  .charger .dot.operational {
    background: #57e08a;
  }
  .charger .dot.non-operational {
    background: #ff7a90;
  }
  .cmeta {
    color: #8a96b3;
  }
  .note {
    margin: 8px 0 0;
    font-size: 11px;
  }
  .warn {
    color: #e0c257;
    font-size: 12px;
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
