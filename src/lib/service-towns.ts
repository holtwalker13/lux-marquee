import {
  MAX_DRIVE_HOURS,
  SERVICE_BASE,
  SERVICE_RADIUS_MILES,
  estimatedDriveHours,
  haversineMiles,
  isOutsideServiceRadius,
  isWithinMaxDrive,
} from "@/lib/service-area";

/** Approximate town/city center for travel estimates from Jackson, MO. */
export type ServiceTown = {
  id: string;
  label: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number;
  lon: number;
  distanceMiles: number;
  estimatedDriveHours: number;
  outsideServiceRadius: boolean;
};

type ServiceTownSeed = {
  id: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number;
  lon: number;
};

/** Southeast Missouri and nearby IL/KY — city-center coordinates. */
const SERVICE_TOWN_SEEDS: ServiceTownSeed[] = [
  { id: "jackson_mo", city: "Jackson", state: "MO", postalCode: "63755", lat: 37.3823, lon: -89.6662 },
  { id: "millersville_mo", city: "Millersville", state: "MO", postalCode: "63766", lat: 37.3167, lon: -89.6889 },
  { id: "gordonville_mo", city: "Gordonville", state: "MO", postalCode: "63752", lat: 37.3028, lon: -89.6772 },
  { id: "chaffee_mo", city: "Chaffee", state: "MO", postalCode: "63740", lat: 37.2803, lon: -89.6553 },
  { id: "cape_girardeau_mo", city: "Cape Girardeau", state: "MO", postalCode: "63701", lat: 37.3059, lon: -89.5181 },
  { id: "oak_ridge_mo", city: "Oak Ridge", state: "MO", postalCode: "63769", lat: 37.4503, lon: -89.7323 },
  { id: "whitewater_mo", city: "Whitewater", state: "MO", postalCode: "63785", lat: 37.2378, lon: -89.7117 },
  { id: "scott_city_mo", city: "Scott City", state: "MO", postalCode: "63780", lat: 37.2164, lon: -89.5247 },
  { id: "delta_mo", city: "Delta", state: "MO", postalCode: "63744", lat: 37.1767, lon: -89.7353 },
  { id: "benton_mo", city: "Benton", state: "MO", postalCode: "63736", lat: 37.0989, lon: -89.5622 },
  { id: "morley_mo", city: "Morley", state: "MO", postalCode: "63767", lat: 37.0428, lon: -89.6139 },
  { id: "oran_mo", city: "Oran", state: "MO", postalCode: "63771", lat: 37.085, lon: -89.655 },
  { id: "advance_mo", city: "Advance", state: "MO", postalCode: "63730", lat: 37.0958, lon: -89.9103 },
  { id: "marble_hill_mo", city: "Marble Hill", state: "MO", postalCode: "63764", lat: 37.3056, lon: -89.9814 },
  { id: "anna_il", city: "Anna", state: "IL", postalCode: "62906", lat: 37.4603, lon: -89.247 },
  { id: "sikeston_mo", city: "Sikeston", state: "MO", postalCode: "63801", lat: 36.8767, lon: -89.5879 },
  { id: "charleston_mo", city: "Charleston", state: "MO", postalCode: "63834", lat: 36.9217, lon: -89.3503 },
  { id: "east_prairie_mo", city: "East Prairie", state: "MO", postalCode: "63845", lat: 36.7798, lon: -89.3854 },
  { id: "bloomfield_mo", city: "Bloomfield", state: "MO", postalCode: "63825", lat: 36.8839, lon: -89.929 },
  { id: "dexter_mo", city: "Dexter", state: "MO", postalCode: "63841", lat: 36.7959, lon: -89.9579 },
  { id: "bernie_mo", city: "Bernie", state: "MO", postalCode: "63822", lat: 36.6706, lon: -89.8189 },
  { id: "new_madrid_mo", city: "New Madrid", state: "MO", postalCode: "63869", lat: 36.5864, lon: -89.5279 },
  { id: "portageville_mo", city: "Portageville", state: "MO", postalCode: "63873", lat: 36.4253, lon: -89.6995 },
  { id: "hayti_mo", city: "Hayti", state: "MO", postalCode: "63851", lat: 36.2337, lon: -89.7495 },
  { id: "caruthersville_mo", city: "Caruthersville", state: "MO", postalCode: "63830", lat: 36.187, lon: -89.6556 },
  { id: "kennett_mo", city: "Kennett", state: "MO", postalCode: "63857", lat: 36.2362, lon: -90.0556 },
  { id: "malden_mo", city: "Malden", state: "MO", postalCode: "63863", lat: 36.5578, lon: -89.9665 },
  { id: "parma_mo", city: "Parma", state: "MO", postalCode: "63870", lat: 36.6142, lon: -89.8182 },
  { id: "campbell_mo", city: "Campbell", state: "MO", postalCode: "63933", lat: 36.4937, lon: -90.0762 },
  { id: "poplar_bluff_mo", city: "Poplar Bluff", state: "MO", postalCode: "63901", lat: 36.757, lon: -90.3929 },
  { id: "perryville_mo", city: "Perryville", state: "MO", postalCode: "63775", lat: 37.7262, lon: -89.8612 },
  { id: "piedmont_mo", city: "Piedmont", state: "MO", postalCode: "63957", lat: 37.1545, lon: -90.6957 },
  { id: "ellsinore_mo", city: "Ellsinore", state: "MO", postalCode: "63937", lat: 36.9328, lon: -90.7479 },
  { id: "van_buren_mo", city: "Van Buren", state: "MO", postalCode: "63965", lat: 37.1551, lon: -91.0143 },
  { id: "doniphan_mo", city: "Doniphan", state: "MO", postalCode: "63935", lat: 36.6206, lon: -90.8232 },
  { id: "ironton_mo", city: "Ironton", state: "MO", postalCode: "63656", lat: 37.597, lon: -90.6873 },
  { id: "farmington_mo", city: "Farmington", state: "MO", postalCode: "63640", lat: 37.7809, lon: -90.4218 },
  { id: "fredericktown_mo", city: "Fredericktown", state: "MO", postalCode: "63645", lat: 37.7003, lon: -90.294 },
  { id: "park_hills_mo", city: "Park Hills", state: "MO", postalCode: "63601", lat: 37.8542, lon: -90.5182 },
  { id: "bonne_terre_mo", city: "Bonne Terre", state: "MO", postalCode: "63628", lat: 37.9231, lon: -90.5554 },
  { id: "ste_genevieve_mo", city: "Ste. Genevieve", state: "MO", postalCode: "63670", lat: 37.9814, lon: -90.0418 },
  { id: "cairo_il", city: "Cairo", state: "IL", postalCode: "62914", lat: 37.0053, lon: -89.1765 },
  { id: "metropolis_il", city: "Metropolis", state: "IL", postalCode: "62960", lat: 37.1512, lon: -88.732 },
  { id: "wickliffe_ky", city: "Wickliffe", state: "KY", postalCode: "42087", lat: 36.9648, lon: -89.089 },
  { id: "paducah_ky", city: "Paducah", state: "KY", postalCode: "42001", lat: 37.0834, lon: -88.6001 },
  { id: "st_louis_mo", city: "St. Louis", state: "MO", postalCode: "63101", lat: 38.627, lon: -90.1994 },
];

const SERVICE_TOWN_SEEDS_IN_RANGE = SERVICE_TOWN_SEEDS.filter((seed) =>
  isWithinMaxDrive(haversineMiles({ lat: seed.lat, lon: seed.lon }, SERVICE_BASE)),
);

function buildTown(seed: ServiceTownSeed): ServiceTown {
  const distanceMiles =
    Math.round(haversineMiles({ lat: seed.lat, lon: seed.lon }, SERVICE_BASE) * 10) / 10;
  return {
    id: seed.id,
    label: `${seed.city}, ${seed.state}`,
    city: seed.city,
    state: seed.state,
    postalCode: seed.postalCode,
    lat: seed.lat,
    lon: seed.lon,
    distanceMiles,
    estimatedDriveHours: estimatedDriveHours(distanceMiles),
    outsideServiceRadius: isOutsideServiceRadius(distanceMiles),
  };
}

export const SERVICE_TOWNS: ServiceTown[] = SERVICE_TOWN_SEEDS_IN_RANGE.map(buildTown).sort(
  (a, b) => a.distanceMiles - b.distanceMiles || a.label.localeCompare(b.label),
);

const TOWN_BY_ID = new Map(SERVICE_TOWNS.map((t) => [t.id, t]));

export function getServiceTownById(id: string): ServiceTown | null {
  return TOWN_BY_ID.get(id.trim()) ?? null;
}

export function getServiceTownDistancePreview(townId: string): {
  distanceMiles: number;
  estimatedDriveHours: number;
  maxDriveHours: number;
  outsideServiceRadius: boolean;
  serviceRadiusMiles: number;
  baseLabel: string;
  townLabel: string;
} | null {
  const town = getServiceTownById(townId);
  if (!town) return null;
  return {
    distanceMiles: town.distanceMiles,
    estimatedDriveHours: town.estimatedDriveHours,
    maxDriveHours: MAX_DRIVE_HOURS,
    outsideServiceRadius: town.outsideServiceRadius,
    serviceRadiusMiles: SERVICE_RADIUS_MILES,
    baseLabel: SERVICE_BASE.label,
    townLabel: town.label,
  };
}
