import type { Server, Socket } from 'socket.io';
import { SessionManager } from './sessionManager';
import type { TripStore } from './store';
import type { DeviceType, Telemetry, TripStatus } from './types';

const room = (tripId: string) => `trip:${tripId}`;

interface JoinPayload {
  tripId: string;
  deviceId: string;
  deviceType: DeviceType;
}
interface TelemetryPayload {
  tripId: string;
  deviceId: string;
  telemetry: Telemetry;
}
interface ControlPayload {
  tripId: string;
  deviceId?: string;
  status: TripStatus;
}
interface ActionPayload {
  tripId: string;
  deviceId: string;
  action: string;
  intent?: string;
}

/**
 * Wire the realtime sync channel onto a Socket.io server.
 * REST handles CRUD; this channel handles live telemetry + state fan-out and
 * the join snapshot that gives a new device the current trip state.
 */
export function attachSyncChannel(
  io: Server,
  store: TripStore,
  sessions: SessionManager = new SessionManager(),
): SessionManager {
  io.on('connection', (socket: Socket) => {
    socket.on('trip:join', async (payload: JoinPayload) => {
      const { tripId, deviceId, deviceType } = payload ?? {};
      if (!tripId) return;
      socket.join(room(tripId));
      sessions.attach({
        tripId,
        deviceId,
        deviceType,
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
      });

      const trip = await store.getTrip(tripId);
      socket.emit('trip:snapshot', {
        trip,
        telemetry: sessions.getTelemetry(tripId),
        devices: sessions.devicesForTrip(tripId),
      });
      io.to(room(tripId)).emit('devices:update', sessions.devicesForTrip(tripId));
    });

    socket.on('telemetry', async (payload: TelemetryPayload) => {
      const { tripId, deviceId, telemetry } = payload ?? {};
      if (!tripId || !telemetry) return;
      sessions.setTelemetry(tripId, telemetry);
      await store.appendEvent({
        tripId,
        deviceId,
        type: 'telemetry',
        payload: telemetry as unknown as Record<string, unknown>,
      });
      io.to(room(tripId)).emit('telemetry', { deviceId, telemetry });
    });

    socket.on('trip:control', async (payload: ControlPayload) => {
      const { tripId, deviceId, status } = payload ?? {};
      if (!tripId || !status) return;
      const trip = await store.updateTripStatus(tripId, status);
      if (!trip) return;
      sessions.setStatus(tripId, trip.status);
      await store.appendEvent({
        tripId,
        deviceId,
        type: 'trip.updated',
        payload: { status },
      });
      io.to(room(tripId)).emit('trip:state', trip);
    });

    socket.on('device:action', async (payload: ActionPayload) => {
      const { tripId, deviceId, action, intent } = payload ?? {};
      if (!tripId) return;
      await store.appendEvent({
        tripId,
        deviceId,
        type: 'action',
        payload: { action, intent },
      });
      io.to(room(tripId)).emit('device:action', { deviceId, action, intent });
    });

    socket.on('disconnect', () => {
      const session = sessions.detach(socket.id);
      if (session) {
        io.to(room(session.tripId)).emit(
          'devices:update',
          sessions.devicesForTrip(session.tripId),
        );
      }
    });
  });

  return sessions;
}
