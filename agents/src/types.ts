/**
 * Shared domain types for Orakon Trip.
 * These flow over both the REST API and the WebSocket sync channel.
 */

export type TripStatus = 'running' | 'paused' | 'redirected' | 'completed';
export type DeviceType = 'car' | 'watch' | 'laptop';
export type IntentAction = 'route' | 'pause' | 'charger';

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface Trip {
  id: string;
  start: GeoPoint;
  end: GeoPoint;
  /** Ordered waypoints from start to end. */
  route: GeoPoint[];
  /** Estimated battery % at arrival (0–100). */
  batteryEst: number;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  type: DeviceType;
  capabilities: string[];
  registeredAt: string;
}

/** Lightweight view of a connected device, broadcast over the sync channel. */
export interface DeviceSummary {
  deviceId: string;
  deviceType: DeviceType;
}

export interface Telemetry {
  gps: GeoPoint;
  /** Current battery % (0–100). */
  battery: number;
  /** km/h. */
  speed: number;
  ts: string;
}

export type EventType =
  | 'trip.created'
  | 'trip.updated'
  | 'telemetry'
  | 'intent'
  | 'action';

/** A single immutable entry in the per-trip audit log. */
export interface TripEvent {
  id: string;
  tripId: string;
  type: EventType;
  deviceId?: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface IntentResult {
  action: IntentAction;
  reason: string;
  /** Optional resolved target (place / charger / new destination). */
  target?: string;
  /** Where the classification came from. */
  source: 'llm' | 'fallback';
}
