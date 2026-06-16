// Robust: treat empty/whitespace as unset (`??` alone does NOT catch ""),
// and strip any trailing slash so `${API_URL}/trips` never doubles up.
const rawApi = import.meta.env.VITE_API_URL;
export const API_URL: string =
  rawApi && rawApi.trim() ? rawApi.trim().replace(/\/+$/, '') : 'https://orakon-trip-api.onrender.com';

const rawTrip = import.meta.env.VITE_TRIP_ID;
export const TRIP_ID: string = rawTrip && rawTrip.trim() ? rawTrip.trim() : 'demo-trip';
