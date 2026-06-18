<script lang="ts">
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import { API_URL, TRIP_ID } from '$lib/config';
  import type { Charger, DeviceSummary, FeedEntry, GeoPoint, Telemetry, Trip, TripStatus, Vehicle } from '$lib/types';
  import { nearbyChargers, pointsInBounds } from '$lib/chargingData';

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
  type PlanStop = { atKm: number; point: GeoPoint; charger: Charger | null; alternatives: Charger[] };
  type TripPlan = { needsCharge: boolean; stops: PlanStop[]; arrivalPct: number; totalKm: number; rangeKm: number };
  let tripPlan = $state<TripPlan | null>(null);
  let vehicles = $state<Vehicle[]>([]);
  let selectedModel = $state('');
  let chargerNote = $state('');

  // Static EV network layer (Orakon Trip live-pack: 142k OCM stations, Europe).
  let showNetwork = $state(false);
  let networkNote = $state('');
  let netRenderTimer: ReturnType<typeof setTimeout> | undefined;
  const NETWORK_MIN_ZOOM = 8;
  const NETWORK_MAX_MARKERS = 2000;

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | undefined;
  let marker: import('leaflet').CircleMarker | undefined;
  let routeLine: import('leaflet').Polyline | undefined;
  let chargerLayer: import('leaflet').LayerGroup | undefined;
  let networkLayer: import('leaflet').LayerGroup | undefined;
  let stopLayer: import('leaflet').LayerGroup | undefined;
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

  // --- Trip metrics, computed client-side from the route (no backend needed) ---
  const totalKm = $derived.by(() => {
    if (!trip) return 0;
    if (trip.route && trip.route.length > 1) return routeLengthKm(trip.route);
    return haversineKm(trip.start, trip.end);
  });
  const kmLeft = $derived.by(() => {
    if (!trip) return null;
    const p = telemetry?.gps ?? trip.start;
    if (trip.route && trip.route.length > 1) return remainingRouteKm(p, trip.route, trip.end);
    return haversineKm(p, trip.end);
  });
  // Live speed if we have it, otherwise assume a motorway cruise for the estimate.
  const effectiveSpeed = $derived(telemetry && telemetry.speed > 0 ? telemetry.speed : 100);
  const etaMin = $derived.by(() => (kmLeft == null ? null : Math.round((kmLeft / effectiveSpeed) * 60)));
  const progressPct = $derived.by(() =>
    totalKm > 0 && kmLeft != null ? Math.max(0, Math.min(100, Math.round((1 - kmLeft / totalKm) * 100))) : 0,
  );
  const batteryPct = $derived(telemetry?.battery ?? trip?.batteryEst ?? null);

  function formatMin(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  function statusLabel(s?: TripStatus): string {
    if (!s) return '—';
    return { running: 'in viaggio', paused: 'in pausa', redirected: 'deviato', completed: 'completato' }[s] ?? s;
  }

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
        findChargers(false); // auto-show chargers, but keep the route in view
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

  async function findChargers(fit = true) {
    // Prefer live position → trip end → trip start → wherever the map looks.
    const c0 = map ? map.getCenter() : null;
    const center =
      telemetry?.gps ?? trip?.end ?? trip?.start ?? (c0 ? { lat: c0.lat, lng: c0.lng } : null);
    if (!center) {
      chargerNote = 'Mappa non pronta — riprova tra un attimo.';
      return;
    }
    chargerNote = 'Cerco colonnine…';
    let list: Charger[] = [];
    let fromLive = false;
    try {
      const res = await fetch(`${API_URL}/chargers?lat=${center.lat}&lng=${center.lng}&radius=15&max=12`);
      if (res.ok) {
        list = ((await res.json()) as { chargers: Charger[] }).chargers ?? [];
        fromLive = list.length > 0;
      }
    } catch {
      /* API down → fall through to the static network */
    }
    // API unreachable OR returned nothing → use the local 142k OCM network.
    if (!list.length) list = await nearbyChargers(center.lat, center.lng, 15, 12);
    chargers = list;
    renderChargers();
    chargerNote = list.length
      ? fromLive
        ? ''
        : 'Da rete OCM (142k).'
      : 'Nessuna colonnina entro 15 km da qui.';
    fitChargers(center, fit);
  }

  function fitChargers(center: { lat: number; lng: number }, fit: boolean) {
    if (!fit || !chargers.length || !map) return;
    const pts = chargers.map((c) => [c.lat, c.lng] as [number, number]);
    pts.push([center.lat, center.lng]);
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  }

  function powerColor(kw: number) {
    return kw >= 150 ? '#34d399' : kw >= 50 ? '#facc15' : '#22d3ee';
  }

  function toggleNetwork() {
    showNetwork = !showNetwork;
    renderNetwork();
  }

  /** Render the static charging network within the current viewport (zoom-gated, capped). */
  async function renderNetwork() {
    if (!map || !L) return;
    if (!networkLayer) networkLayer = L.layerGroup().addTo(map);
    if (!showNetwork) {
      networkLayer.clearLayers();
      networkNote = '';
      return;
    }
    if (map.getZoom() < NETWORK_MIN_ZOOM) {
      networkLayer.clearLayers();
      networkNote = 'Zooma per vedere la rete di ricarica.';
      return;
    }
    const b = map.getBounds();
    try {
      const pts = await pointsInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), NETWORK_MAX_MARKERS);
      if (!showNetwork || !networkLayer) return;
      networkLayer.clearLayers();
      for (const p of pts) {
        const kw = p[3] || 0;
        const col = powerColor(kw);
        L.circleMarker([p[1], p[2]], { radius: 4, color: col, weight: 1, fillColor: col, fillOpacity: 0.75 })
          .bindPopup(`<b>${p[4] || 'Stazione'}</b><br/>${kw ? kw + ' kW' : 'potenza n/d'}<br/><span style="opacity:.6">OCM #${p[0]}</span>`)
          .addTo(networkLayer);
      }
      networkNote =
        pts.length >= NETWORK_MAX_MARKERS
          ? `${NETWORK_MAX_MARKERS}+ colonnine (le più potenti) — zooma per il dettaglio.`
          : `${pts.length} colonnine in vista.`;
    } catch (e) {
      networkNote = `Rete statica non caricata: ${e instanceof Error ? e.message : String(e)}`;
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

  // Plan the charge stop client-side against the static 142k network, so it
  // works regardless of the live backend (which often returns no charger).
  // Multi-stop charge plan along the route: add a stop whenever the battery
  // would reach the reserve, assume a top-up to ~80%, repeat until arrival.
  async function planCharge() {
    if (!trip) return;
    const route = trip.route && trip.route.length > 1 ? trip.route : [trip.start, trip.end];
    const cum = cumulative(route);
    const total = cum[cum.length - 1];
    const range = vehicleRangeKm();
    const reservePct = 10;
    const targetPct = 80; // recharge back up to this at each stop

    let battery = telemetry?.battery ?? trip.batteryEst ?? 80;
    let posKm = telemetry?.gps ? Math.max(0, total - remainingRouteKm(telemetry.gps, route, trip.end)) : 0;

    const stops: PlanStop[] = [];
    for (let guard = 0; guard < 12 && stops.length < 6; guard++) {
      const reachableKm = posKm + (range * (battery - reservePct)) / 100;
      if (reachableKm >= total) break; // can finish without another stop
      const stopKm = Math.max(posKm, Math.min(total, reachableKm));
      const point = interpAlong(route, cum, stopKm);
      const near = await nearbyChargers(point.lat, point.lng, 40, 5);
      stops.push({ atKm: Math.round(stopKm), point, charger: near[0] ?? null, alternatives: near });
      posKm = stopKm;
      battery = targetPct;
    }
    const arrivalPct = Math.round(battery - ((total - posKm) / range) * 100);
    tripPlan = { needsCharge: stops.length > 0, stops, arrivalPct, totalKm: Math.round(total), rangeKm: Math.round(range) };

    chargers = stops.flatMap((s) => s.alternatives).slice(0, 8);
    renderChargers();
    renderStops();
    if (stops[0]) map?.setView([stops[0].point.lat, stops[0].point.lng], 9);
  }

  function renderStops() {
    if (!map || !L) return;
    const LL = L;
    if (!stopLayer) stopLayer = LL.layerGroup().addTo(map);
    const layer = stopLayer;
    layer.clearLayers();
    (tripPlan?.stops ?? []).forEach((s, i) => {
      const c = s.charger;
      const m = LL.circleMarker([s.point.lat, s.point.lng], { radius: 12, color: '#ffcc33', fillColor: 'transparent', weight: 3 })
        .bindPopup(
          `<b>Sosta ${i + 1} · ~${s.atKm} km</b>` +
            (c ? `<br/>${c.name} · ${c.powerKW ?? '?'} kW` : '<br/>nessuna colonnina trovata qui'),
        )
        .addTo(layer);
      if (i === 0) m.openPopup();
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

  function routeLengthKm(route: GeoPoint[]): number {
    let km = 0;
    for (let i = 1; i < route.length; i++) km += haversineKm(route[i - 1], route[i]);
    return km;
  }

  /** Distance still to drive: hop to the nearest route vertex, then follow it to the end. */
  function remainingRouteKm(pos: GeoPoint, route: GeoPoint[], end: GeoPoint): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineKm(pos, route[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    let km = bestD;
    for (let i = best + 1; i < route.length; i++) km += haversineKm(route[i - 1], route[i]);
    return km;
  }

  // --- Trip simulation: drive the car along the route, draining the battery ---
  let simRunning = $state(false);
  let simTimer: ReturnType<typeof setInterval> | undefined;
  let simDistKm = 0;
  let simCum: number[] = [];
  const SIM_CRUISE_KMH = 100;
  const SIM_STEP_KM = 5; // advanced per tick
  const SIM_TICK_MS = 350;

  /** Real-world range (km) from the chosen vehicle, else a generic 300 km. */
  function vehicleRangeKm(): number {
    const v = vehicles.find((x) => x.id === selectedModel);
    if (v && v.batteryKwh && v.consumptionWhKm) return (v.batteryKwh / v.consumptionWhKm) * 1000;
    return 300;
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  /** Point on `route` at cumulative distance `km` (using its precomputed `cum` array). */
  function interpAlong(route: GeoPoint[], cum: number[], km: number): GeoPoint {
    if (km <= 0) return route[0];
    for (let i = 1; i < cum.length; i++) {
      if (cum[i] >= km) {
        const seg = cum[i] - cum[i - 1] || 1;
        const t = (km - cum[i - 1]) / seg;
        return { lat: lerp(route[i - 1].lat, route[i].lat, t), lng: lerp(route[i - 1].lng, route[i].lng, t) };
      }
    }
    return route[route.length - 1];
  }
  function cumulative(route: GeoPoint[]): number[] {
    const cum = [0];
    for (let i = 1; i < route.length; i++) cum[i] = cum[i - 1] + haversineKm(route[i - 1], route[i]);
    return cum;
  }
  const posAtKm = (route: GeoPoint[], km: number) => interpAlong(route, simCum, km);

  function toggleSim() {
    if (simRunning) { stopSim(); return; }
    const route = trip?.route;
    if (!route || route.length < 2) {
      chargerNote = 'Crea prima un viaggio con un percorso, poi avvia la simulazione.';
      return;
    }
    simCum = cumulative(route);
    simDistKm = 0;
    const startBattery = telemetry?.battery ?? trip?.batteryEst ?? 80;
    const range = vehicleRangeKm();
    simRunning = true;
    pushFeed('sim', 'viaggio simulato avviato');
    simTimer = setInterval(() => {
      const total = simCum[simCum.length - 1];
      simDistKm = Math.min(total, simDistKm + SIM_STEP_KM);
      const pos = posAtKm(route, simDistKm);
      const battery = Math.max(0, startBattery - (simDistKm / range) * 100);
      updateTelemetry({ gps: pos, battery: Math.round(battery), speed: SIM_CRUISE_KMH, ts: new Date().toISOString() });
      if (simDistKm >= total) { stopSim(); pushFeed('sim', 'arrivato a destinazione'); }
    }, SIM_TICK_MS);
  }

  function stopSim() {
    simRunning = false;
    if (simTimer) { clearInterval(simTimer); simTimer = undefined; }
  }

  onMount(() => {
    (async () => {
      L = (await import('leaflet')).default;
      map = L.map(mapEl).setView([44, 11], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Keep the static network layer in sync with the viewport when active.
      // Debounced so following a moving car (continuous panning) doesn't
      // redraw the 2000-marker layer every frame (that caused the flicker).
      map.on('moveend', () => {
        if (!showNetwork) return;
        clearTimeout(netRenderTimer);
        netRenderTimer = setTimeout(() => renderNetwork(), 500);
      });

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
      stopSim();
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
    <div class="map-wrap">
      <div class="map" bind:this={mapEl}></div>
      <div class="map-controls">
        <button class="net-toggle" class:on={showNetwork} onclick={toggleNetwork} aria-pressed={showNetwork}>
          <span class="led"></span>{showNetwork ? '🔌 Colonnine ON' : '🔌 Colonnine OFF'}
        </button>
        {#if showNetwork && networkNote}
          <div class="net-note">{networkNote}</div>
        {/if}
      </div>
    </div>

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
        <h2>Viaggio</h2>
        <div class="row">
          <span>Stato</span>
          <b class="badge {trip?.status ?? 'unknown'}">{statusLabel(trip?.status)}</b>
        </div>
        <div class="row"><span>Distanza totale</span><b>{totalKm ? totalKm.toFixed(0) + ' km' : '—'}</b></div>
        <div class="row" title="Quanti km mancano alla destinazione">
          <span>Mancano</span><b>{kmLeft != null ? kmLeft.toFixed(0) + ' km' : '—'}</b>
        </div>
        <div class="row" title="ETA = Estimated Time of Arrival, tempo stimato di arrivo">
          <span>Arrivo stimato</span><b>{etaMin != null ? formatMin(etaMin) : '—'}</b>
        </div>
        <div class="row"><span>Batteria</span><b>{batteryPct != null ? batteryPct + '%' : '—'}</b></div>
        <div class="row"><span>Velocità</span><b>{telemetry?.speed ?? 0} km/h</b></div>
        <div class="progress" title="Avanzamento sul percorso"><div class="bar" style="width:{progressPct}%"></div></div>
        <div class="row sub"><span>Percorso completato</span><b>{progressPct}%</b></div>
      </section>

      <section class="card">
        <h2>Comandi</h2>
        <button class="primary sim" class:running={simRunning} onclick={toggleSim}>
          {simRunning ? '⏸ Ferma simulazione' : '▶ Simula viaggio'}
        </button>
        <p class="muted note">
          <b>Batteria & posizione</b> arrivano da un dispositivo collegato (auto/app) via API, oppure da
          <i>Simula viaggio</i>. Un sito web non può leggere la batteria dell'auto reale senza l'API del
          costruttore (es. Tesla/Enel X) o un dispositivo OBD.
        </p>
        <div class="controls">
          <button onclick={() => control('paused')}>Pausa</button>
          <button onclick={() => control('running')}>Riprendi</button>
          <button onclick={() => control('redirected')}>Devia</button>
        </div>
      </section>

      <section class="card">
        <h2>Colonnine</h2>
        <p class="muted note">Usa <b>🔌 Colonnine</b> sulla mappa per la rete completa (142k), oppure cerca le più vicine al centro mappa qui sotto.</p>
        <label>Veicolo (consumo reale)
          <select bind:value={selectedModel}>
            <option value="">Generico (~300 km)</option>
            {#each vehicles as v (v.id)}
              <option value={v.id}>{v.name}</option>
            {/each}
          </select>
        </label>
        <div class="controls">
          <button class="primary" onclick={() => findChargers(true)}>Cerca vicine</button>
          <button class="primary" onclick={planCharge}>Pianifica ricarica</button>
        </div>
        {#if chargerNote}
          <p class="muted note">{chargerNote}</p>
        {/if}
        {#if tripPlan}
          {#if tripPlan.needsCharge}
            <p class="warn note">
              ⚡ {tripPlan.stops.length}
              {tripPlan.stops.length === 1 ? 'sosta di ricarica consigliata' : 'soste di ricarica consigliate'}
              · arrivo stimato ~{tripPlan.arrivalPct}%.
            </p>
            <div class="chargers">
              {#each tripPlan.stops as s, i (s.atKm)}
                <div class="charger">
                  <span class="dot operational"></span>
                  <span class="cname">Sosta {i + 1} · ~{s.atKm} km — {s.charger?.name ?? 'colonnina non trovata'}</span>
                  <span class="cmeta">{s.charger?.powerKW ?? '?'}kW</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="ok note">✓ Arrivi con ~{tripPlan.arrivalPct}% — nessuna ricarica necessaria ({tripPlan.totalKm} km).</p>
          {/if}
          <p class="muted note">Stima lineare (autonomia {tripPlan.rangeKm} km, riserva 10%, ricarica all'80%) — non un calcolo EV reale.</p>
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
  .map-wrap {
    position: relative;
    min-height: 0;
  }
  .map {
    height: 100%;
    background: #0a0f1f;
  }
  .map-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 500;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .net-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: auto;
    flex: none;
    padding: 9px 14px;
    border-radius: 999px;
    border: 1px solid #2a3a66;
    background: rgba(13, 20, 40, 0.92);
    backdrop-filter: blur(8px);
    color: #b7c2dd;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 6px 20px -8px rgba(0, 0, 0, 0.8);
  }
  .net-toggle .led {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #46506b;
    transition: 0.2s;
  }
  .net-toggle.on {
    color: #06222b;
    background: #22d3ee;
    border-color: transparent;
  }
  .net-toggle.on .led {
    background: #053226;
    box-shadow: 0 0 8px #053226;
  }
  .net-note {
    font-size: 11px;
    color: #cdd6ea;
    background: rgba(13, 20, 40, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid #2a3a66;
    border-radius: 8px;
    padding: 5px 9px;
  }
  .progress {
    height: 7px;
    border-radius: 999px;
    background: #0d1428;
    border: 1px solid #1c2540;
    overflow: hidden;
    margin: 10px 0 4px;
  }
  .progress .bar {
    height: 100%;
    background: linear-gradient(90deg, #2a4ea0, #22d3ee);
    transition: width 0.3s;
  }
  .row.sub span,
  .row.sub b {
    font-size: 12px;
    color: #8a96b3;
  }
  button.sim.running {
    background: #6b2330;
    border-color: #8a2c3e;
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
