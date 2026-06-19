import type {
  Device,
  DeviceType,
  GeoPoint,
  Trip,
  TripEvent,
  TripStatus,
} from './types';

export interface CreateTripInput {
  id?: string;
  start: GeoPoint;
  end: GeoPoint;
  route?: GeoPoint[];
  routeKm?: number;
  routeMin?: number;
  batteryEst?: number;
}

export interface RegisterDeviceInput {
  id?: string;
  type: DeviceType;
  capabilities?: string[];
}

export interface AppendEventInput {
  tripId: string;
  type: TripEvent['type'];
  deviceId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Trip state store. The `events` collection is an append-only audit log:
 * implementations must never mutate or delete existing events.
 */
export interface TripStore {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  close(): Promise<void>;

  createTrip(input: CreateTripInput): Promise<Trip>;
  getTrip(id: string): Promise<Trip | null>;
  updateTripStatus(id: string, status: TripStatus): Promise<Trip | null>;
  listTrips(): Promise<Trip[]>;

  registerDevice(input: RegisterDeviceInput): Promise<Device>;
  getDevice(id: string): Promise<Device | null>;
  listDevices(): Promise<Device[]>;

  appendEvent(input: AppendEventInput): Promise<TripEvent>;
  listEvents(tripId: string): Promise<TripEvent[]>;
}

/**
 * Pick a store based on the environment.
 * - DATABASE_URL set  → Postgres (Supabase-ready)
 * - otherwise         → in-memory (zero-config, fully runnable)
 *
 * Postgres is loaded lazily so the `pg` driver is never required in the
 * in-memory path (handy for tests and quick demos).
 */
export async function createStore(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): Promise<TripStore> {
  if (databaseUrl && databaseUrl.trim().length > 0) {
    const { PostgresStore } = await import('./postgresStore');
    const store = new PostgresStore(databaseUrl);
    await store.init();
    return store;
  }
  const { InMemoryStore } = await import('./memoryStore');
  const store = new InMemoryStore();
  await store.init();
  return store;
}
