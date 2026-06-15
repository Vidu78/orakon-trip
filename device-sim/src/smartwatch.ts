import { io } from 'socket.io-client';
import type { GeoPoint, Telemetry, Trip, TripStatus } from '../../agents/src/types';
import { API_URL, TRIP_ID } from './config';
import { ensureTrip, haversineKm, registerDevice, sendIntent } from './common';

/** Smartwatch: shows ETA + battery, reacts to suggestions, can request actions. */
async function main(): Promise<void> {
  const device = await registerDevice('watch', ['notify', 'accept', 'dismiss', 'route']);
  const trip = await ensureTrip();
  const end: GeoPoint = trip.end;
  console.log(`[watch] device=${device.id} trip=${TRIP_ID} → ${API_URL}`);

  const socket = io(API_URL, { transports: ['websocket', 'polling'] });

  const showEta = (t: Telemetry) => {
    const km = haversineKm(t.gps, end);
    const mins = Math.round((km / Math.max(t.speed, 1)) * 60);
    const eta = t.speed > 0 ? `${mins} min` : 'paused';
    console.log(`[watch] ⌚ ETA ${eta} · ${km.toFixed(0)} km left · battery ${t.battery}%`);
  };

  socket.on('connect', () => {
    socket.emit('trip:join', { tripId: TRIP_ID, deviceId: device.id, deviceType: 'watch' });
  });
  socket.on('trip:snapshot', (snap: { trip: Trip | null; telemetry: Telemetry | null }) => {
    console.log(`[watch] joined — status ${snap.trip?.status ?? 'unknown'} (continuity restored)`);
    if (snap.telemetry) showEta(snap.telemetry);
  });
  socket.on('telemetry', ({ telemetry }: { telemetry: Telemetry }) => showEta(telemetry));
  socket.on('trip:state', (t: { status: TripStatus }) => console.log(`[watch] trip → ${t.status}`));
  socket.on('intent:suggestion', (s: { action: string; reason: string }) => {
    console.log(`[watch] 💡 ${s.action}: ${s.reason} → auto-accepting`);
    socket.emit('device:action', {
      tripId: TRIP_ID,
      deviceId: device.id,
      action: 'accept',
      intent: s.action,
    });
  });

  // Demo: a few seconds in, the watch asks for a charger (low battery).
  setTimeout(async () => {
    const result = await sendIntent('battery is getting low, find a fast charger nearby', device.id);
    console.log(`[watch] requested intent → ${result.action} (${result.source})`);
  }, 8000);
}

main().catch((err) => {
  console.error('[watch] error', err);
  process.exit(1);
});
