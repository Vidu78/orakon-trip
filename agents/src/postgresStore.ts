import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
import type {
  AppendEventInput,
  CreateTripInput,
  RegisterDeviceInput,
  TripStore,
} from './store';
import type { Device, Trip, TripEvent, TripStatus } from './types';

const { Pool } = pkg;
type PgPool = InstanceType<typeof Pool>;

const SCHEMA = readFileSync(
  fileURLToPath(new URL('./schema.sql', import.meta.url)),
  'utf8',
);

function needsSsl(connectionString: string): boolean {
  if (/sslmode=disable/.test(connectionString)) return false;
  return !/localhost|127\.0\.0\.1/.test(connectionString);
}

/** Postgres-backed store (works against Supabase out of the box). */
export class PostgresStore implements TripStore {
  readonly kind = 'postgres' as const;
  private pool: PgPool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createTrip(input: CreateTripInput): Promise<Trip> {
    const id = input.id ?? randomUUID();
    const route = input.route?.length ? input.route : [input.start, input.end];
    const { rows } = await this.pool.query(
      `insert into trips (id, start, "end", route, battery_est, status)
       values ($1, $2, $3, $4, $5, 'running')
       on conflict (id) do update set
         start = excluded.start,
         "end" = excluded."end",
         route = excluded.route,
         battery_est = excluded.battery_est,
         updated_at = now()
       returning *`,
      [
        id,
        JSON.stringify(input.start),
        JSON.stringify(input.end),
        JSON.stringify(route),
        input.batteryEst ?? 100,
      ],
    );
    return mapTrip(rows[0]);
  }

  async getTrip(id: string): Promise<Trip | null> {
    const { rows } = await this.pool.query('select * from trips where id = $1', [id]);
    return rows[0] ? mapTrip(rows[0]) : null;
  }

  async updateTripStatus(id: string, status: TripStatus): Promise<Trip | null> {
    const { rows } = await this.pool.query(
      `update trips set status = $2, updated_at = now() where id = $1 returning *`,
      [id, status],
    );
    return rows[0] ? mapTrip(rows[0]) : null;
  }

  async listTrips(): Promise<Trip[]> {
    const { rows } = await this.pool.query('select * from trips order by created_at desc');
    return rows.map(mapTrip);
  }

  async registerDevice(input: RegisterDeviceInput): Promise<Device> {
    const id = input.id ?? randomUUID();
    const { rows } = await this.pool.query(
      `insert into devices (id, type, capabilities)
       values ($1, $2, $3)
       on conflict (id) do update set type = excluded.type, capabilities = excluded.capabilities
       returning *`,
      [id, input.type, JSON.stringify(input.capabilities ?? [])],
    );
    return mapDevice(rows[0]);
  }

  async getDevice(id: string): Promise<Device | null> {
    const { rows } = await this.pool.query('select * from devices where id = $1', [id]);
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async listDevices(): Promise<Device[]> {
    const { rows } = await this.pool.query('select * from devices order by registered_at desc');
    return rows.map(mapDevice);
  }

  async appendEvent(input: AppendEventInput): Promise<TripEvent> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `insert into events (id, trip_id, type, device_id, payload)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [id, input.tripId, input.type, input.deviceId ?? null, JSON.stringify(input.payload ?? {})],
    );
    return mapEvent(rows[0]);
  }

  async listEvents(tripId: string): Promise<TripEvent[]> {
    const { rows } = await this.pool.query(
      'select * from events where trip_id = $1 order by ts asc',
      [tripId],
    );
    return rows.map(mapEvent);
  }
}

function mapTrip(r: Record<string, unknown>): Trip {
  return {
    id: r.id as string,
    start: r.start as Trip['start'],
    end: r.end as Trip['end'],
    route: (r.route as Trip['route']) ?? [],
    batteryEst: Number(r.battery_est),
    status: r.status as TripStatus,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

function mapDevice(r: Record<string, unknown>): Device {
  return {
    id: r.id as string,
    type: r.type as Device['type'],
    capabilities: (r.capabilities as string[]) ?? [],
    registeredAt: new Date(r.registered_at as string).toISOString(),
  };
}

function mapEvent(r: Record<string, unknown>): TripEvent {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    type: r.type as TripEvent['type'],
    deviceId: (r.device_id as string) ?? undefined,
    payload: (r.payload as Record<string, unknown>) ?? {},
    ts: new Date(r.ts as string).toISOString(),
  };
}
