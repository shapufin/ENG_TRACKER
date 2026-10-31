import { describe, expect, it } from "vitest";
import { buildFacets, matchingUserIds, toggleFacet } from "./calendarFacets";
import type { User } from "@/types";

const person = (
  id: number,
  clients: [number, string][] = [],
  techs: [number, string][] = []
) =>
  ({
    id,
    clients_detail: clients.map(([cid, name]) => ({ id: cid, name, code: name })),
    techs_detail: techs.map(([tid, name]) => ({ id: tid, name, code: name, level: null })),
  }) as unknown as User;

const users = [
  person(1, [[10, "Acme"]], [[20, "DB"]]),
  person(2, [[10, "Acme"], [11, "Beta"]], [[21, "Infra"]]),
  person(3, [[11, "Beta"]], [[20, "DB"]]),
  person(4),
];

describe("buildFacets", () => {
  it("counts people per client and tech, sorted by label", () => {
    const { clients, techs } = buildFacets(users);
    expect(clients).toEqual([
      { value: "10", label: "Acme", count: 2 },
      { value: "11", label: "Beta", count: 2 },
    ]);
    expect(techs).toEqual([
      { value: "20", label: "DB", count: 2 },
      { value: "21", label: "Infra", count: 1 },
    ]);
  });

  it("is empty when nobody has clients or techs (older payloads too)", () => {
    expect(buildFacets([{ id: 1 } as User, person(2)])).toEqual({ clients: [], techs: [] });
  });
});

describe("matchingUserIds", () => {
  it("returns null when nothing is selected, meaning 'show everyone'", () => {
    expect(matchingUserIds(users, { client: null, tech: null })).toBeNull();
  });

  it("filters by client", () => {
    expect(matchingUserIds(users, { client: "11", tech: null })).toEqual([2, 3]);
  });

  it("combines client and tech with AND", () => {
    expect(matchingUserIds(users, { client: "11", tech: "20" })).toEqual([3]);
  });

  it("returns an empty list when nobody matches both", () => {
    expect(matchingUserIds(users, { client: "10", tech: "21" })).toEqual([2]);
    expect(matchingUserIds(users, { client: "99", tech: null })).toEqual([]);
  });
});

describe("toggleFacet", () => {
  it("selects a value, and clears it when pressed again", () => {
    const first = toggleFacet({ client: null, tech: null }, "client", "10");
    expect(first).toEqual({ client: "10", tech: null });
    expect(toggleFacet(first, "client", "10")).toEqual({ client: null, tech: null });
  });

  it("replaces the value within one facet and keeps the other facet", () => {
    expect(toggleFacet({ client: "10", tech: "20" }, "client", "11")).toEqual({
      client: "11",
      tech: "20",
    });
  });
});
