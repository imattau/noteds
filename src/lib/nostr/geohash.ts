const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface GeohashCenter {
  latitude: number;
  longitude: number;
}

export function encodeGeohash(lat: number, lon: number, precision = 6): string {
  const latRange: [number, number] = [-90, 90];
  const lonRange: [number, number] = [-180, 180];
  let geohash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) {
        ch |= 1 << (4 - bit);
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    evenBit = !evenBit;

    if (bit < 4) {
      bit += 1;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

/** Decode a geohash to the center of its cell. Prefixes are valid inputs. */
export function decodeGeohash(geohash: string): GeohashCenter | null {
  if (!geohash) return null;
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let evenBit = true;

  for (const character of geohash.toLowerCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) return null;
    for (let bit = 4; bit >= 0; bit -= 1) {
      const set = (value & (1 << bit)) !== 0;
      if (evenBit) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        lonRange = set ? [mid, lonRange[1]] : [lonRange[0], mid];
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        latRange = set ? [mid, latRange[1]] : [latRange[0], mid];
      }
      evenBit = !evenBit;
    }
  }

  return {
    latitude: (latRange[0] + latRange[1]) / 2,
    longitude: (lonRange[0] + lonRange[1]) / 2
  };
}

export function distanceKm(first: GeohashCenter, second: GeohashCenter): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const latitudeOne = first.latitude * radians;
  const latitudeTwo = second.latitude * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
