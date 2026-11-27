/** Straight-line distances for /eat. Locations stay in the browser. */
export type LatLon = { lat: number; lon: number };

/** One store: chain, name, address, suburb, lat, lon (public/eat/stores-perth.json). */
export type EatStore = [string, string, string, string, number, number];

export type StoresFile = {
  generated: string;
  source: string;
  stores: EatStore[];
  suburbs: [string, number, number][];
};

export const PERTH_CBD: LatLon & { name: string } = { name: 'Perth CBD', lat: -31.9523, lon: 115.8613 };
export const NEAR_KM = 5;

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type NearestStore = {
  chain: string;
  name: string;
  address: string;
  suburb: string;
  lat: number;
  lon: number;
  km: number;
};

/** The nearest store of each chain to a point. */
export function nearestByChain(stores: EatStore[], at: LatLon): Map<string, NearestStore> {
  const best = new Map<string, NearestStore>();
  for (const [chain, name, address, suburb, lat, lon] of stores) {
    const km = distanceKm(at, { lat, lon });
    const current = best.get(chain);
    if (!current || km < current.km) best.set(chain, { chain, name, address, suburb, lat, lon, km });
  }
  return best;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Google Maps directions link for a store (opens the map app on phones). */
export function directionsUrl(store: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`;
}
