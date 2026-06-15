import type { DeviceType, Telemetry, TripStatus } from './types';

export interface DeviceSession {
  deviceId: string;
  deviceType: DeviceType;
  socketId: string;
  tripId: string;
  joinedAt: string;
}

export interface DeviceSummary {
  deviceId: string;
  deviceType: DeviceType;
}

/**
 * Tracks which devices are connected to which trip, plus the latest known
 * telemetry/state per trip. This is what powers cross-device continuity:
 * a device that joins late immediately receives the current snapshot so the
 * trip "continues" seamlessly from car → watch → laptop.
 */
export class SessionManager {
  private sessions = new Map<string, DeviceSession>(); // keyed by socketId
  private lastTelemetry = new Map<string, Telemetry>(); // keyed by tripId
  private lastStatus = new Map<string, TripStatus>(); // keyed by tripId

  attach(session: DeviceSession): void {
    this.sessions.set(session.socketId, session);
  }

  detach(socketId: string): DeviceSession | undefined {
    const session = this.sessions.get(socketId);
    this.sessions.delete(socketId);
    return session;
  }

  devicesForTrip(tripId: string): DeviceSummary[] {
    return [...this.sessions.values()]
      .filter((s) => s.tripId === tripId)
      .map((s) => ({ deviceId: s.deviceId, deviceType: s.deviceType }));
  }

  setTelemetry(tripId: string, telemetry: Telemetry): void {
    this.lastTelemetry.set(tripId, telemetry);
  }

  getTelemetry(tripId: string): Telemetry | null {
    return this.lastTelemetry.get(tripId) ?? null;
  }

  setStatus(tripId: string, status: TripStatus): void {
    this.lastStatus.set(tripId, status);
  }

  getStatus(tripId: string): TripStatus | null {
    return this.lastStatus.get(tripId) ?? null;
  }
}
