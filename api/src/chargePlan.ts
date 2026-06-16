import type { GeoPoint, Trip } from '../../agents/src/types';
import { type Charger, findChargers } from './chargers';

/**
 * Heuristic EV charging plan along the trip's road geometry.
 *
 * HONEST NOTE: this is a *linear* battery model (constant consumption over
 * distance, from an assumed full-charge range). It ignores elevation, speed,
 * weather and the specific vehicle. It's a useful estimate, not a guarantee.
 */
export interface ChargePlan {
  needsCharge: boolean;
  rangeKm: number;
  reservePct: number;
  startBatteryPct: number;
  totalKm: number;
  batteryAtArrivalPct: number;
  stop: null | {
    atKm: number;
    point: GeoPoint;
    batteryAtStopPct: number;
    charger: Charger | null;
    alternatives: Charger[];
  };
}

export async function planCharging(
  trip: Trip,
  opts: { rangeKm: number; reservePct: number; startBatteryPct: number },
): Promise<ChargePlan> {
  const { rangeKm, reservePct, startBatteryPct } = opts;
  const route = trip.route && trip.route.length >= 2 ? trip.route : [trip.start, trip.end];

  // Cumulative distance (km) at each route point.
  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1]! + haversineKm(route[i - 1]!, route[i]!));
  }
  const totalKm = cum[cum.length - 1]!;
  const pctPerKm = 100 / rangeKm;
  const batteryAtArrivalPct = startBatteryPct - totalKm * pctPerKm;

  const base = {
    rangeKm,
    reservePct,
    startBatteryPct,
    totalKm: round(totalKm),
    batteryAtArrivalPct: round(batteryAtArrivalPct),
  };

  // Enough charge to arrive above the reserve → no stop needed.
  if (batteryAtArrivalPct >= reservePct) {
    return { needsCharge: false, ...base, stop: null };
  }

  // Distance at which the battery would hit the reserve threshold.
  const kmToReserve = Math.max(0, ((startBatteryPct - reservePct) / 100) * rangeKm);
  const point = pointAtKm(route, cum, kmToReserve);

  const chargers = await findChargers(point.lat, point.lng, 20, 10).catch(() => [] as Charger[]);
  const fast = chargers.filter((c) => (c.powerKW ?? 0) >= 50);
  const list = fast.length ? fast : chargers;

  return {
    needsCharge: true,
    ...base,
    stop: {
      atKm: round(kmToReserve),
      point,
      batteryAtStopPct: reservePct,
      charger: list[0] ?? null,
      alternatives: list.slice(0, 5),
    },
  };
}

function pointAtKm(route: GeoPoint[], cum: number[], targetKm: number): GeoPoint {
  if (targetKm <= 0) return route[0]!;
  const total = cum[cum.length - 1]!;
  if (targetKm >= total) return route[route.length - 1]!;
  let i = 1;
  while (i < cum.length && cum[i]! < targetKm) i++;
  const a = route[i - 1]!;
  const b = route[i]!;
  const segStart = cum[i - 1]!;
  const segEnd = cum[i]!;
  const t = segEnd > segStart ? (targetKm - segStart) / (segEnd - segStart) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const round = (n: number) => Math.round(n * 10) / 10;
