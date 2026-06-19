import type { GeoPoint } from '../../agents/src/types';

/**
 * Real driving-route geometry via OSRM (open-source routing).
 * Default to the public demo server; override OSRM_URL for production.
 */
const OSRM = (process.env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/+$/, '');
const MAX_POINTS = 400;

export interface RoadRoute {
  points: GeoPoint[];
  /** Driving distance along roads (km). */
  km: number;
  /** OSRM driving duration (minutes) — real road speeds, not a flat assumption. */
  min: number;
}

/** Road geometry + real distance/duration. Returns null on failure (caller falls back). */
export async function roadRoute(waypoints: GeoPoint[]): Promise<RoadRoute | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }>;
    };
    const route = data.routes?.[0];
    const raw = route?.geometry?.coordinates;
    if (data.code !== 'Ok' || !raw || raw.length < 2) return null;

    const points = downsample(raw, MAX_POINTS).map(([lng, lat]): GeoPoint => ({ lat, lng }));
    // Preserve the endpoint labels (start/end) on the road geometry.
    points[0]!.label = waypoints[0]!.label;
    points[points.length - 1]!.label = waypoints[waypoints.length - 1]!.label;
    return {
      points,
      km: Math.round((route.distance ?? 0) / 1000),
      min: Math.round((route.duration ?? 0) / 60),
    };
  } catch {
    return null;
  }
}

/** Evenly thin an array to at most `max` items, always keeping first and last. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]!);
  out[out.length - 1] = arr[arr.length - 1]!;
  return out;
}
