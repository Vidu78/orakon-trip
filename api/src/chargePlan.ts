import type { GeoPoint, Trip } from '../../agents/src/types';
import { type Charger, findChargers } from './chargers';

/**
 * Heuristic EV charging plan along the trip's road geometry.
 *
 * HONEST NOTE: this is a *linear* battery model (constant consumption over
 * distance, from an assumed full-charge range). It ignores elevation, speed,
 * weather and the specific vehicle. It's a useful estimate, not a guarantee.
 */
export interface VehicleMeta {
  id: string;
  name: string;
  batteryKwh: number;
  consumptionWhKm: number;
  wltpRangeKm: number;
  realWorldFactor: number;
}

export interface PlanStop {
  atKm: number;
  point: GeoPoint;
  batteryAtStopPct: number;
  charger: Charger | null;
  alternatives: Charger[];
}

export interface ChargePlan {
  needsCharge: boolean;
  rangeKm: number;
  reservePct: number;
  startBatteryPct: number;
  totalKm: number;
  batteryAtArrivalPct: number;
  vehicle: VehicleMeta | null;
  stops: PlanStop[];
  /** @deprecated use stops[0] */
  stop: PlanStop | null;
}

const TARGET_PCT = 80; // charge back up to this at each stop
const MAX_STOPS = 8;

export async function planCharging(
  trip: Trip,
  opts: { rangeKm: number; reservePct: number; startBatteryPct: number; vehicle?: VehicleMeta | null },
): Promise<ChargePlan> {
  const { rangeKm, reservePct } = opts;
  const vehicle = opts.vehicle ?? null;
  const route = trip.route && trip.route.length >= 2 ? trip.route : [trip.start, trip.end];

  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1]! + haversineKm(route[i - 1]!, route[i]!));
  }
  const totalKm = cum[cum.length - 1]!;

  const base = { rangeKm, reservePct, startBatteryPct: opts.startBatteryPct, totalKm: round(totalKm), vehicle };

  let battery = opts.startBatteryPct;
  let posKm = 0;
  const stops: PlanStop[] = [];

  for (let guard = 0; guard < MAX_STOPS; guard++) {
    const reachableKm = posKm + (rangeKm * (battery - reservePct)) / 100;
    if (reachableKm >= totalKm) break; // can finish without another stop

    const stopKm = Math.max(posKm + 0.1, Math.min(totalKm, reachableKm));
    const point = pointAtKm(route, cum, stopKm);

    const chargers = await findChargers(point.lat, point.lng, 20, 10).catch(() => [] as Charger[]);
    const fast = chargers.filter((c) => (c.powerKW ?? 0) >= 50);
    const list = fast.length ? fast : chargers;

    stops.push({
      atKm: round(stopKm),
      point,
      batteryAtStopPct: reservePct,
      charger: list[0] ?? null,
      alternatives: list.slice(0, 5),
    });

    posKm = stopKm;
    battery = TARGET_PCT; // assume recharged to 80% at each stop
  }

  const batteryAtArrivalPct = round(battery - ((totalKm - posKm) / rangeKm) * 100);

  return {
    needsCharge: stops.length > 0,
    ...base,
    batteryAtArrivalPct,
    stops,
    stop: stops[0] ?? null,
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
