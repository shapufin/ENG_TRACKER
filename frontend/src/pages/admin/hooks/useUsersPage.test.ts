import { describe, it, expect } from "vitest";
import { filterUsersByTL } from "./useUsersPageHelpers";
import type { UserProfile } from "@/types";

const users: UserProfile[] = [
  { id: 1, italian_tl: true, albanian_tl: false } as unknown as UserProfile,
  { id: 2, italian_tl: false, albanian_tl: true } as unknown as UserProfile,
  { id: 3, italian_tl: false, albanian_tl: false } as unknown as UserProfile,
];

describe("filterUsersByTL", () => {
  it("returns all rows for all filter", () => {
    expect(filterUsersByTL(users, "all")).toEqual(users);
  });

  it("filters italian_tl", () => {
    expect(filterUsersByTL(users, "italian_tl").map((u) => u.id)).toEqual([1]);
  });

  it("filters albanian_tl", () => {
    expect(filterUsersByTL(users, "albanian_tl").map((u) => u.id)).toEqual([2]);
  });

  it("filters no_tl", () => {
    expect(filterUsersByTL(users, "no_tl").map((u) => u.id)).toEqual([3]);
  });
});
