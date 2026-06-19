import { randomUUID } from 'node:crypto';
import type {
  AppendEventInput,
  CreateTripInput,
  RegisterDeviceInput,
  TripStore,
} from './store';
import type { Device, Trip, TripEvent, TripStatus } from './types';

/** Zero-dependency store for local dev, demos, and tests. */
export class InMemoryStore implements TripStore {
  readonly kind = 'memory' as const;
  private trips = new Map<string, Trip>();
  private devices = new Map<string, Device>();
  private events = new Map<string, TripEvent[]>();

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async createTrip(input: CreateTripInput): Promise<Trip> {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const trip: Trip = {
      id,
      start: input.start,
      end: input.end,
      route: input.route?.length ? input.route : [input.start, input.end],
      routeKm: input.routeKm,
      routeMin: input.routeMin,
      batteryEst: input.batteryEst ?? 100,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    this.trips.set(id, trip);
    if (!this.events.has(id)) this.events.set(id, []);
    return { ...trip };
  }

  async getTrip(id: string): Promise<Trip | null> {
    const t = this.trips.get(id);
    return t ? { ...t } : null;
  }

  async updateTripStatus(id: string, status: TripStatus): Promise<Trip | null> {
    const t = this.trips.get(id);
    if (!t) return null;
    t.status = status;
    t.updatedAt = new Date().toISOString();
    this.trips.set(id, t);
    return { ...t };
  }

  async listTrips(): Promise<Trip[]> {
    return [...this.trips.values()].map((t) => ({ ...t }));
  }

  async registerDevice(input: RegisterDeviceInput): Promise<Device> {
    const id = input.id ?? randomUUID();
    const device: Device = {
      id,
      type: input.type,
      capabilities: input.capabilities ?? [],
      registeredAt: new Date().toISOString(),
    };
    this.devices.set(id, device);
    return { ...device };
  }

  async getDevice(id: string): Promise<Device | null> {
    const d = this.devices.get(id);
    return d ? { ...d } : null;
  }

  async listDevices(): Promise<Device[]> {
    return [...this.devices.values()].map((d) => ({ ...d }));
  }

  async appendEvent(input: AppendEventInput): Promise<TripEvent> {
    const event: TripEvent = {
      id: randomUUID(),
      tripId: input.tripId,
      type: input.type,
      deviceId: input.deviceId,
      payload: input.payload ?? {},
      ts: new Date().toISOString(),
    };
    const list = this.events.get(input.tripId) ?? [];
    list.push(event);
    this.events.set(input.tripId, list);
    return { ...event };
  }

  async listEvents(tripId: string): Promise<TripEvent[]> {
    return [...(this.events.get(tripId) ?? [])];
  }
}
