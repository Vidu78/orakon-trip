import type { DeviceType, GeoPoint, IntentResult, Trip } from '../../agents/src/types';
import { API_URL, TRIP_ID } from './config';

/** Milano → Roma, a handful of waypoints. */
export const DEMO_ROUTE: GeoPoint[] = [
  { lat: 45.4642, lng: 9.19, label: 'Milano' },
  { lat: 44.8015, lng: 10.3279, label: 'Parma' },
  { lat: 44.4949, lng: 11.3426, label: 'Bologna' },
  { lat: 43.7696, lng: 11.2558, label: 'Firenze' },
  { lat: 43.1107, lng: 12.3908, label: 'Perugia' },
  { lat: 41.9028, lng: 12.4964, label: 'Roma' },
];

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function registerDevice(
  type: DeviceType,
  capabilities: string[],
): Promise<{ id: string; type: DeviceType }> {
  return postJson('/devices', { type, capabilities });
}

/** Idempotent: reuse the demo trip if it exists, else create it. */
export async function ensureTrip(): Promise<Trip> {
  const existing = await fetch(`${API_URL}/trips/${TRIP_ID}`);
  if (existing.ok) {
    const data = (await existing.json()) as { trip: Trip };
    return data.trip;
  }
  return postJson<Trip>('/trips', {
    id: TRIP_ID,
    start: DEMO_ROUTE[0],
    end: DEMO_ROUTE[DEMO_ROUTE.length - 1],
    route: DEMO_ROUTE,
    batteryEst: 85,
  });
}

export async function sendIntent(text: string, deviceId: string): Promise<IntentResult> {
  return postJson<IntentResult>('/intent', { text, deviceId, tripId: TRIP_ID });
}

export function lerp(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Position along a multi-point route for progress in [0, 1]. */
export function positionAt(route: GeoPoint[], progress: number): GeoPoint {
  if (route.length < 2) return route[0] ?? { lat: 0, lng: 0 };
  const segments = route.length - 1;
  const scaled = Math.min(Math.max(progress, 0), 1) * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  return lerp(route[i]!, route[i + 1]!, scaled - i);
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const round = (n: number): number => Math.round(n * 10) / 10;
