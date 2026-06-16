// Mirror of the API domain types relevant to the dashboard.
export type TripStatus = 'running' | 'paused' | 'redirected' | 'completed';

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface Trip {
  id: string;
  start: GeoPoint;
  end: GeoPoint;
  route: GeoPoint[];
  batteryEst: number;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Telemetry {
  gps: GeoPoint;
  battery: number;
  speed: number;
  ts: string;
}

export interface DeviceSummary {
  deviceId: string;
  deviceType: 'car' | 'watch' | 'laptop';
}

export interface FeedEntry {
  type: string;
  detail: string;
  ts: string;
}

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

export interface ChargePlan {
  needsCharge: boolean;
  rangeKm: number;
  reservePct: number;
  startBatteryPct: number;
  totalKm: number;
  batteryAtArrivalPct: number;
  stop: null | {
    atKm: number;
    point: { lat: number; lng: number };
    batteryAtStopPct: number;
    charger: Charger | null;
    alternatives: Charger[];
  };
}
