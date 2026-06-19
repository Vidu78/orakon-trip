// Next charge stop, computed client-side against the static 142k network so it
// works regardless of the live backend. Same model as the dashboard multi-stop
// planner, narrowed to the *next* stop ahead of the current position — the one
// thing a smartwatch needs to show on the wrist.
import type { Charger, GeoPoint, Telemetry, Trip } from './types';
import { haversineKm, nearbyChargers } from './chargingData';

const geoKm = (a: GeoPoint, b: GeoPoint): number => haversineKm(a.lat, a.lng, b.lat, b.lng);

const DEFAULT_RANGE_KM = 300; // generic EV range when no model is selected
const RESERVE_PCT = 10; // never plan below this battery reserve

function cumulative(route: GeoPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum[i] = cum[i - 1] + geoKm(route[i - 1], route[i]);
  return cum;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function interpAlong(route: GeoPoint[], cum: number[], km: number): GeoPoint {
  if (km <= 0) return route[0];
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= km) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (km - cum[i - 1]) / seg;
      return { lat: lerp(route[i - 1].lat, route[i].lat, t), lng: lerp(route[i - 1].lng, route[i].lng, t) };
    }
  }
  return route[route.length - 1];
}

/** Distance still to drive: hop to the nearest route vertex, then follow it to the end. */
function remainingRouteKm(pos: GeoPoint, route: GeoPoint[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = geoKm(pos, route[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  let km = bestD;
  for (let i = best + 1; i < route.length; i++) km += geoKm(route[i - 1], route[i]);
  return km;
}

export interface NextStop {
  atKm: number; // distance from trip start where the stop falls
  kmToStop: number; // distance from current position to the stop
  etaMin: number | null; // minutes to the stop at current speed (null when stopped)
  charger: Charger | null; // nearest charger to that point (null if none within 40 km)
}

/**
 * The next charge stop ahead, or `null` when the car can finish on its current
 * charge. Mirrors the dashboard planner: project how far the battery reaches
 * before hitting the reserve, place the stop there, snap to the nearest charger.
 */
export async function nextChargeStop(
  trip: Trip,
  telemetry: Telemetry | null,
  rangeKm: number = DEFAULT_RANGE_KM,
): Promise<NextStop | null> {
  const route = trip.route && trip.route.length > 1 ? trip.route : [trip.start, trip.end];
  const cum = cumulative(route);
  const total = cum[cum.length - 1];
  const range = rangeKm > 0 ? rangeKm : DEFAULT_RANGE_KM;

  const battery = telemetry?.battery ?? trip.batteryEst ?? 80;
  const posKm = telemetry?.gps ? Math.max(0, total - remainingRouteKm(telemetry.gps, route)) : 0;

  const reachableKm = posKm + (range * (battery - RESERVE_PCT)) / 100;
  if (reachableKm >= total) return null; // can finish without charging

  const stopKm = Math.max(posKm, Math.min(total, reachableKm));
  const point = interpAlong(route, cum, stopKm);
  const near = await nearbyChargers(point.lat, point.lng, 40, 1);
  const charger = near[0] ?? null;

  const kmToStop = Math.max(0, stopKm - posKm);
  const speed = telemetry?.speed ?? 0;
  const etaMin = speed > 0 ? Math.round((kmToStop / speed) * 60) : null;

  return { atKm: Math.round(stopKm), kmToStop: Math.round(kmToStop), etaMin, charger };
}
