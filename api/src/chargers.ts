/**
 * Charger lookup via OpenChargeMap (free public API).
 * https://openchargemap.org/site/develop/api
 *
 * Note: OpenChargeMap exposes operational status + power, but NOT reliable
 * real-time "available/occupied" for most POIs. We surface the operational
 * status honestly rather than faking live availability.
 */

const OCM_URL = 'https://api.openchargemap.io/v3/poi';

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

interface OcmPoi {
  ID?: number;
  AddressInfo?: {
    ID?: number;
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Latitude?: number;
    Longitude?: number;
    Distance?: number;
  };
  Connections?: Array<{ PowerKW?: number }>;
  StatusType?: { IsOperational?: boolean | null };
  UsageCost?: string | null;
}

function normalize(poi: OcmPoi): Charger | null {
  const a = poi.AddressInfo;
  if (!a || typeof a.Latitude !== 'number' || typeof a.Longitude !== 'number') return null;

  const conns = Array.isArray(poi.Connections) ? poi.Connections : [];
  const powerKW = conns.reduce((max, c) => Math.max(max, Number(c?.PowerKW) || 0), 0) || null;

  const op = poi.StatusType?.IsOperational;
  const status: Charger['status'] =
    op === true ? 'operational' : op === false ? 'non-operational' : 'unknown';

  return {
    id: poi.ID ?? a.ID ?? `${a.Latitude},${a.Longitude}`,
    name: a.Title || a.AddressLine1 || 'Colonnina',
    lat: a.Latitude,
    lng: a.Longitude,
    distanceKm: typeof a.Distance === 'number' ? a.Distance : null,
    powerKW,
    status,
    cost: poi.UsageCost || null,
    town: a.Town || null,
  };
}

const statusRank = (s: Charger['status']) => (s === 'operational' ? 0 : s === 'unknown' ? 1 : 2);

/** Nearest chargers around a point, sorted by operational → distance → power. */
export async function findChargers(
  lat: number,
  lng: number,
  radiusKm = 10,
  max = 15,
): Promise<Charger[]> {
  const params = new URLSearchParams({
    output: 'json',
    latitude: String(lat),
    longitude: String(lng),
    distance: String(radiusKm),
    distanceunit: 'KM',
    maxresults: String(max),
    compact: 'true',
    verbose: 'false',
  });
  const key = process.env.OPENCHARGEMAP_API_KEY;
  if (key) params.set('key', key);

  const res = await fetch(`${OCM_URL}?${params.toString()}`, {
    headers: key ? { 'X-API-Key': key } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`OpenChargeMap ${res.status}`);

  const data = (await res.json()) as OcmPoi[];
  const chargers = data.map(normalize).filter((c): c is Charger => c !== null);
  chargers.sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) ||
      (b.powerKW ?? 0) - (a.powerKW ?? 0),
  );
  return chargers;
}
