/**
 * EV model catalog — usable battery capacity (kWh) and WLTP combined
 * consumption (Wh/km). Figures from manufacturer / EV Database (WLTP).
 *
 * HONEST NOTE: WLTP is optimistic vs real motorway driving. We derate the
 * usable range with a real-world factor (default 0.8 ≈ +25% consumption).
 * That factor is still a heuristic — it does NOT model elevation, ambient
 * temperature, payload, HVAC or driving style. It just replaces the old
 * "assume a flat 300 km" guess with per-model battery + consumption data.
 */
export interface Vehicle {
  id: string;
  name: string;
  type: 'car' | 'van';
  batteryKwh: number; // usable
  consumptionWhKm: number; // WLTP combined
}

// Curated, recognizable EU models. Vans included because Orakon's target is
// B2B EV fleets (last-mile / field service), where range anxiety is acute.
export const VEHICLES: Vehicle[] = [
  // Cars
  { id: 'tesla-model-3-lr', name: 'Tesla Model 3 Long Range', type: 'car', batteryKwh: 75, consumptionWhKm: 149 },
  { id: 'tesla-model-y-lr', name: 'Tesla Model Y Long Range', type: 'car', batteryKwh: 75, consumptionWhKm: 167 },
  { id: 'vw-id3-pro', name: 'VW ID.3 Pro', type: 'car', batteryKwh: 58, consumptionWhKm: 158 },
  { id: 'vw-id4-pro', name: 'VW ID.4 Pro', type: 'car', batteryKwh: 77, consumptionWhKm: 172 },
  { id: 'renault-megane-ev60', name: 'Renault Megane E-Tech 60', type: 'car', batteryKwh: 60, consumptionWhKm: 164 },
  { id: 'fiat-500e', name: 'Fiat 500e (42)', type: 'car', batteryKwh: 37.3, consumptionWhKm: 149 },
  { id: 'hyundai-kona-64', name: 'Hyundai Kona Electric 64', type: 'car', batteryKwh: 64, consumptionWhKm: 147 },
  { id: 'kia-ev6-lr', name: 'Kia EV6 Long Range', type: 'car', batteryKwh: 77.4, consumptionWhKm: 165 },
  { id: 'peugeot-e208', name: 'Peugeot e-208 (50)', type: 'car', batteryKwh: 46.3, consumptionWhKm: 161 },
  { id: 'bmw-i4-edrive40', name: 'BMW i4 eDrive40', type: 'car', batteryKwh: 80.7, consumptionWhKm: 160 },
  // Vans (fleet)
  { id: 'renault-kangoo-etech', name: 'Renault Kangoo E-Tech', type: 'van', batteryKwh: 45, consumptionWhKm: 192 },
  { id: 'citroen-e-berlingo', name: 'Citroën ë-Berlingo (50)', type: 'van', batteryKwh: 46.3, consumptionWhKm: 200 },
  { id: 'peugeot-e-expert', name: 'Peugeot e-Expert (75)', type: 'van', batteryKwh: 71, consumptionWhKm: 233 },
  { id: 'vw-id-buzz-cargo', name: 'VW ID. Buzz Cargo', type: 'van', batteryKwh: 77, consumptionWhKm: 230 },
  { id: 'ford-e-transit', name: 'Ford E-Transit (68)', type: 'van', batteryKwh: 68, consumptionWhKm: 320 },
  { id: 'stellantis-e-ducato', name: 'Fiat E-Ducato (110)', type: 'van', batteryKwh: 105, consumptionWhKm: 350 },
];

export const DEFAULT_REALWORLD_FACTOR = Number(process.env.EV_REALWORLD_FACTOR) || 0.8;

export function listVehicles(): Vehicle[] {
  return VEHICLES;
}

export function getVehicle(id: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.id === id.toLowerCase());
}

/** WLTP range (km) = usable battery / consumption. */
export function wltpRangeKm(v: Vehicle): number {
  return (v.batteryKwh * 1000) / v.consumptionWhKm;
}

/** Derated, real-world-ish range (km). */
export function realRangeKm(v: Vehicle, factor = DEFAULT_REALWORLD_FACTOR): number {
  return wltpRangeKm(v) * factor;
}
