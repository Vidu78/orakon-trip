import { io } from 'socket.io-client';
import type { GeoPoint, Telemetry, TripStatus } from '../../agents/src/types';
import { API_URL, TICK_MS, TRIP_ID } from './config';
import { DEMO_ROUTE, ensureTrip, positionAt, registerDevice, round } from './common';

/** Vehicle: emits gps/battery/speed telemetry as it drives the route. */
async function main(): Promise<void> {
  const device = await registerDevice('car', ['gps', 'battery', 'speed']);
  const trip = await ensureTrip();
  const route: GeoPoint[] = trip.route?.length ? trip.route : DEMO_ROUTE;
  console.log(`[vehicle] device=${device.id} trip=${TRIP_ID} → ${API_URL}`);

  const socket = io(API_URL, { transports: ['websocket', 'polling'] });
  let progress = 0;
  let battery = trip.batteryEst ?? 85;
  let status: TripStatus = trip.status ?? 'running';

  socket.on('connect', () => {
    console.log('[vehicle] connected');
    socket.emit('trip:join', { tripId: TRIP_ID, deviceId: device.id, deviceType: 'car' });
  });
  socket.on('trip:state', (t: { status: TripStatus }) => {
    status = t.status;
    console.log(`[vehicle] trip state → ${status}`);
  });
  socket.on('intent:suggestion', (s: { action: string; reason: string }) => {
    console.log(`[vehicle] 💡 suggestion: ${s.action} (${s.reason})`);
  });

  setInterval(() => {
    const moving = status === 'running' || status === 'redirected';
    if (moving) {
      progress = Math.min(progress + 0.02, 1);
      battery = Math.max(battery - 0.6, 0);
    }
    const telemetry: Telemetry = {
      gps: positionAt(route, progress),
      battery: round(battery),
      speed: moving ? 80 + Math.round(Math.random() * 40) : 0,
      ts: new Date().toISOString(),
    };
    socket.emit('telemetry', { tripId: TRIP_ID, deviceId: device.id, telemetry });

    if (moving && progress >= 1 && status !== 'completed') {
      socket.emit('trip:control', { tripId: TRIP_ID, deviceId: device.id, status: 'completed' });
    }
  }, TICK_MS);
}

main().catch((err) => {
  console.error('[vehicle] error', err);
  process.exit(1);
});
