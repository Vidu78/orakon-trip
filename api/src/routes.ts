import type { FastifyInstance } from 'fastify';
import type { GeoPoint, TripStatus } from '../../agents/src/types';
import { classifyIntent } from './llm/intent';

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
    const trip = await store.createTrip({
      id: body.id,
      start: body.start,
      end: body.end,
      route: body.route,
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
}
