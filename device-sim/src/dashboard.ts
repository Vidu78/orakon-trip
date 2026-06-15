import { io } from 'socket.io-client';
import type { DeviceSummary, Telemetry, Trip, TripStatus } from '../../agents/src/types';
import { API_URL, TRIP_ID } from './config';
import { ensureTrip, registerDevice } from './common';

/**
 * Headless dashboard simulator: observes the trip and can send a control.
 * Usage: `npm run sim:dashboard -- pause | resume | redirect`
 */
const COMMANDS: Record<string, TripStatus> = {
  pause: 'paused',
  resume: 'running',
  redirect: 'redirected',
};

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const device = await registerDevice('laptop', ['map', 'control']);
  await ensureTrip();
  console.log(`[dashboard] device=${device.id} trip=${TRIP_ID} → ${API_URL}`);

  const socket = io(API_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('trip:join', { tripId: TRIP_ID, deviceId: device.id, deviceType: 'laptop' });
    if (cmd && COMMANDS[cmd]) {
      setTimeout(() => {
        console.log(`[dashboard] sending control → ${cmd} (${COMMANDS[cmd]})`);
        socket.emit('trip:control', { tripId: TRIP_ID, deviceId: device.id, status: COMMANDS[cmd] });
      }, 1000);
    }
  });
  socket.on('trip:snapshot', (snap: { trip: Trip | null; devices: DeviceSummary[] }) => {
    console.log(`[dashboard] snapshot — status ${snap.trip?.status}, devices: ${labels(snap.devices)}`);
  });
  socket.on('telemetry', ({ telemetry }: { deviceId: string; telemetry: Telemetry }) => {
    const { lat, lng } = telemetry.gps;
    console.log(`[dashboard] 📍 ${lat.toFixed(3)},${lng.toFixed(3)} · ${telemetry.speed} km/h · ${telemetry.battery}%`);
  });
  socket.on('trip:state', (t: { status: TripStatus }) => console.log(`[dashboard] trip → ${t.status}`));
  socket.on('devices:update', (devices: DeviceSummary[]) => console.log(`[dashboard] devices: ${labels(devices)}`));
  socket.on('intent:suggestion', (s: { action: string; reason: string }) => console.log(`[dashboard] 💡 ${s.action}: ${s.reason}`));

  if (!cmd) {
    console.log('[dashboard] tip: run with a command, e.g. `npm run sim:dashboard -- pause`');
  }
}

const labels = (devices: DeviceSummary[]) => devices.map((d) => d.deviceType).join(', ') || 'none';

main().catch((err) => {
  console.error('[dashboard] error', err);
  process.exit(1);
});
