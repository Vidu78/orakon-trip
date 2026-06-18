// Static EV charging network sourced from the Orakon Trip live-pack
// (Open Charge Map, Europe). Loaded once, queried client-side so the
// dashboard keeps working even when the live API is cold or unreachable.
import type { Charger } from './types';

// [id, lat, lng, power_kw, name] — compact positional rows from overview.json.
export type ChargePoint = [number | string, number, number, number, string];

// Served from the deployed live-pack CDN (CORS-enabled) so the dashboard
// stays lean. Override with VITE_CHARGING_DATA_URL for a local/other source.
const DATA_URL: string =
  import.meta.env.VITE_CHARGING_DATA_URL?.trim() ||
  'https://orakon-live-pack.vercel.app/data/overview.json';

let cache: ChargePoint[] | null = null;
let loading: Promise<ChargePoint[]> | null = null;

export function isLoaded(): boolean {
  return cache != null;
}

export async function loadChargingData(): Promise<ChargePoint[]> {
  if (cache) return cache;
  if (!loading) {
    loading = fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`charging data HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { points: ChargePoint[] }) => {
        cache = d.points ?? [];
        return cache;
      })
      .catch((e) => {
        loading = null; // allow retry on next call
        throw e;
      });
  }
  return loading;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function toCharger(p: ChargePoint, distanceKm: number | null): Charger {
  return {
    id: p[0],
    name: p[4] || `OCM #${p[0]}`,
    lat: p[1],
    lng: p[2],
    distanceKm,
    powerKW: p[3] || null,
    status: 'unknown',
    cost: null,
    town: null,
  };
}

/** Nearest chargers within `radiusKm` of a point — used as an API fallback. */
export async function nearbyChargers(
  lat: number,
  lng: number,
  radiusKm: number,
  max: number,
): Promise<Charger[]> {
  const pts = await loadChargingData();
  const hits: Charger[] = [];
  for (const p of pts) {
    const d = haversineKm(lat, lng, p[1], p[2]);
    if (d <= radiusKm) hits.push(toCharger(p, d));
  }
  hits.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return hits.slice(0, max);
}

/**
 * Points inside a lat/lng box, capped to `max` (highest-power first) so the
 * map only ever renders a bounded number of markers regardless of zoom.
 */
export async function pointsInBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  max: number,
): Promise<ChargePoint[]> {
  const pts = await loadChargingData();
  const hits: ChargePoint[] = [];
  for (const p of pts) {
    if (p[1] >= south && p[1] <= north && p[2] >= west && p[2] <= east) hits.push(p);
  }
  if (hits.length > max) {
    hits.sort((a, b) => (b[3] || 0) - (a[3] || 0));
    return hits.slice(0, max);
  }
  return hits;
}
