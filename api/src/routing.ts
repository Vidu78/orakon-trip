import type { GeoPoint } from '../../agents/src/types';

/**
 * Real driving-route geometry via OSRM (open-source routing).
 * Default to the public demo server; override OSRM_URL for production.
 */
const OSRM = (process.env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/+$/, '');
const MAX_POINTS = 400;

/** Road geometry through the waypoints. Returns null on failure (caller falls back). */
export async function roadRoute(waypoints: GeoPoint[]): Promise<GeoPoint[] | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const raw = data.routes?.[0]?.geometry?.coordinates;
    if (data.code !== 'Ok' || !raw || raw.length < 2) return null;

    const points = downsample(raw, MAX_POINTS).map(([lng, lat]): GeoPoint => ({ lat, lng }));
    // Preserve the endpoint labels (start/end) on the road geometry.
    points[0]!.label = waypoints[0]!.label;
    points[points.length - 1]!.label = waypoints[waypoints.length - 1]!.label;
    return points;
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
