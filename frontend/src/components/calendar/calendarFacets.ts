import type { User } from "@/types";

/** One chip: a client or tech and how many of the listed people work on it. */
export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface FacetSelection {
  client: string | null;
  tech: string | null;
}

export const NO_FACETS: FacetSelection = { client: null, tech: null };

type Labelled = { id: number; name: string };

const clientsOf = (user: User): Labelled[] => user.clients_detail ?? [];
const techsOf = (user: User): Labelled[] => user.techs_detail ?? [];

function countBy(users: User[], pick: (user: User) => Labelled[]): Facet[] {
  const found = new Map<string, Facet>();
  for (const user of users) {
    for (const item of pick(user)) {
      const key = String(item.id);
      const facet = found.get(key) ?? { value: key, label: item.name, count: 0 };
      facet.count += 1;
      found.set(key, facet);
    }
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function buildFacets(users: User[]): { clients: Facet[]; techs: Facet[] } {
  return { clients: countBy(users, clientsOf), techs: countBy(users, techsOf) };
}

/** Ids of the people who match every selected facet, or null when nothing is selected. */
export function matchingUserIds(users: User[], selection: FacetSelection): number[] | null {
  if (!selection.client && !selection.tech) return null;
  return users
    .filter(
      (user) =>
        (!selection.client || clientsOf(user).some((c) => String(c.id) === selection.client)) &&
        (!selection.tech || techsOf(user).some((t) => String(t.id) === selection.tech))
    )
    .map((user) => user.id);
}

export function toggleFacet(
  selection: FacetSelection,
  facet: keyof FacetSelection,
  value: string
): FacetSelection {
  return { ...selection, [facet]: selection[facet] === value ? null : value };
}
