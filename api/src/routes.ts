import type { FastifyInstance } from 'fastify';
import type { GeoPoint, TripStatus } from '../../agents/src/types';
import { findChargers } from './chargers';
import { classifyIntent } from './llm/intent';
import { roadRoute } from './routing';

const TRIP_STATUSES: TripStatus[] = ['running', 'paused', 'redirected', 'completed'];
const DEVICE_TYPES = ['car', 'watch', 'laptop'] as const;
const room = (tripId: string) => `trip:${tripId}`;

interface CreateTripBody {
  id?: string;
  start?: GeoPoint;
  end?: GeoPoint;
  route?: GeoPoint[];
  batteryEst?: number;
}
interface UpdateTripBody {
  status?: TripStatus;
}
interface CreateDeviceBody {
  id?: string;
  type?: (typeof DEVICE_TYPES)[number];
  capabilities?: string[];
}
interface IntentBody {
  text?: string;
  deviceId?: string;
  tripId?: string;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const { store, io } = app;

  // POST /trips — create a trip.
  app.post<{ Body: CreateTripBody }>('/trips', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.start || !body.end) {
      return reply.code(400).send({ error: 'start and end are required' });
    }
    // Snap to the real road network (OSRM); fall back to the provided route
    // (or a straight start→end line) if routing is unavailable.
    const waypoints = body.route && body.route.length >= 2 ? body.route : [body.start, body.end];
    const road = await roadRoute(waypoints);
    const trip = await store.createTrip({
      id: body.id,
      start: body.start,
      end: body.end,
      route: road ?? body.route,
      batteryEst: body.batteryEst,
    });
    await store.appendEvent({ tripId: trip.id, type: 'trip.created', payload: { trip } });
    io.to(room(trip.id)).emit('trip:state', trip);
    return reply.code(201).send(trip);
  });

  // GET /trips/:id — trip state + immutable event list.
  app.get<{ Params: { id: string } }>('/trips/:id', async (req, reply) => {
    const trip = await store.getTrip(req.params.id);
    if (!trip) return reply.code(404).send({ error: 'trip not found' });
    const events = await store.listEvents(req.params.id);
    return { trip, events };
  });

  // PUT /trips/:id — update trip state (running | paused | redirected | completed).
  app.put<{ Params: { id: string }; Body: UpdateTripBody }>('/trips/:id', async (req, reply) => {
    const status = req.body?.status;
    if (!status || !TRIP_STATUSES.includes(status)) {
      return reply.code(400).send({ error: `status must be one of: ${TRIP_STATUSES.join(', ')}` });
    }
    const trip = await store.updateTripStatus(req.params.id, status);
    if (!trip) return reply.code(404).send({ error: 'trip not found' });
    await store.appendEvent({ tripId: trip.id, type: 'trip.updated', payload: { status } });
    io.to(room(trip.id)).emit('trip:state', trip);
    return trip;
  });

  // POST /devices — register a device.
  app.post<{ Body: CreateDeviceBody }>('/devices', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.type || !DEVICE_TYPES.includes(body.type)) {
      return reply.code(400).send({ error: `type must be one of: ${DEVICE_TYPES.join(', ')}` });
    }
    const device = await store.registerDevice({
      id: body.id,
      type: body.type,
      capabilities: body.capabilities,
    });
    return reply.code(201).send(device);
  });

  // POST /intent — natural language → { action }.
  app.post<{ Body: IntentBody }>('/intent', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.text || !body.text.trim()) {
      return reply.code(400).send({ error: 'text is required' });
    }
    const result = await classifyIntent(body.text);
    if (body.tripId) {
      await store.appendEvent({
        tripId: body.tripId,
        deviceId: body.deviceId,
        type: 'intent',
        payload: { text: body.text, ...result },
      });
      io.to(room(body.tripId)).emit('intent:suggestion', {
        deviceId: body.deviceId,
        text: body.text,
        ...result,
      });
    }
    return result;
  });

  // GET /audit?tripId= — immutable event log for a trip.
  app.get<{ Querystring: { tripId?: string } }>('/audit', async (req, reply) => {
    const tripId = req.query.tripId;
    if (!tripId) return reply.code(400).send({ error: 'tripId query param is required' });
    const events = await store.listEvents(tripId);
    return { tripId, count: events.length, events };
  });

  // GET /chargers?lat=&lng=&radius=&max= — nearby EV chargers (OpenChargeMap).
  app.get<{ Querystring: { lat?: string; lng?: string; radius?: string; max?: string } }>(
    '/chargers',
    async (req, reply) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.code(400).send({ error: 'lat and lng are required numbers' });
      }
      const radius = Number(req.query.radius) || 10;
      const max = Math.min(Number(req.query.max) || 15, 50);
      try {
        const chargers = await findChargers(lat, lng, radius, max);
        const hint =
          chargers.length === 0 && !process.env.OPENCHARGEMAP_API_KEY
            ? 'no results — register a free OPENCHARGEMAP_API_KEY (openchargemap.org); anonymous requests are blocked'
            : undefined;
        return { count: chargers.length, chargers, source: 'openchargemap', ...(hint ? { hint } : {}) };
      } catch (err) {
        req.log.error({ err }, 'charger lookup failed');
        const warning = !process.env.OPENCHARGEMAP_API_KEY
          ? 'set OPENCHARGEMAP_API_KEY (free, openchargemap.org) — anonymous requests are blocked'
          : 'charger provider unavailable';
        return reply.send({ count: 0, chargers: [], source: 'openchargemap', warning });
      }
    },
  );
}
