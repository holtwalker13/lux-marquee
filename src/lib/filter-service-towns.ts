import type { ServiceTown } from "@/lib/service-towns";

export function filterServiceTowns(towns: ServiceTown[], query: string): ServiceTown[] {
  const q = query.trim().toLowerCase();
  if (!q) return towns;
  return towns.filter(
    (town) =>
      town.label.toLowerCase().includes(q) ||
      town.city.toLowerCase().includes(q) ||
      town.state.toLowerCase().includes(q),
  );
}
