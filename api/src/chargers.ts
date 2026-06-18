/**
 * Charger lookup backed by the Orakon Trip live-pack CDN (142k OCM stations,
 * Europe). We query our own pre-fetched dataset instead of hitting
 * OpenChargeMap live: OCM sits behind Cloudflare and returns 403 to datacenter
 * IPs (Render included), and the pack is complete, fast and not rate-limited.
 *
 * Note: the static dataset exposes power + identity but NOT live availability,
 * so status is reported as 'unknown' rather than faking "available/occupied".
 */

const DATA_URL =
  process.env.CHARGING_DATA_URL || 'https://orakon-live-pack.vercel.app/data/overview.json';

export interface Charger {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  powerKW: number | null;
  status: 'operational' | 'non-operational' | 'unknown';
  cost: string | null;
  town: string | null;
}

// Compact overview rows: [id, lat, lng, power_kw, name].
type Point = [number | string, number, number, number, string];

let cache: Point[] | null = null;
let loading: Promise<Point[]> | null = null;

async function loadPoints(): Promise<Point[]> {
  if (cache) return cache;
  if (!loading) {
    loading = fetch(DATA_URL, { signal: AbortSignal.timeout(20000) })
      .then((r) => {
        if (!r.ok) throw new Error(`charging data ${r.status}`);
        return r.json() as Promise<{ points: Point[] }>;
      })
      .then((d) => {
        cache = d.points ?? [];
        return cache;
      })
      .catch((err) => {
        loading = null; // allow retry on the next request
        throw err;
      });
  }
  return loading;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearest chargers around a point, sorted by distance then power. */
export async function findChargers(
  lat: number,
  lng: number,
  radiusKm = 10,
  max = 15,
): Promise<Charger[]> {
  const points = await loadPoints();
  const hits: Charger[] = [];
  for (const p of points) {
    const d = haversineKm(lat, lng, p[1], p[2]);
    if (d <= radiusKm) {
      hits.push({
        id: p[0],
        name: p[4] || `OCM #${p[0]}`,
        lat: p[1],
        lng: p[2],
        distanceKm: Math.round(d * 10) / 10,
        powerKW: p[3] || null,
        status: 'unknown',
        cost: null,
        town: null,
      });
    }
  }
  hits.sort(
    (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || (b.powerKW ?? 0) - (a.powerKW ?? 0),
  );
  return hits.slice(0, max);
}
