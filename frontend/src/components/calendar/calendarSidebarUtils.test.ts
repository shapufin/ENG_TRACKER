import { describe, it, expect } from "vitest";
import { teamLabel, userDisplayName } from "./calendarSidebarUtils";
import type { User } from "@/types";

const baseUser: User = {
  id: 1,
  username: "alice",
  first_name: "Alice",
  last_name: "Smith",
  full_name: "Alice Smith",
  email: "alice@example.com",
} as User;

describe("teamLabel", () => {
  it("returns team name from teams array", () => {
    expect(teamLabel({ ...baseUser, teams: [{ id: 1, name: "Engineering" }] } as User)).toBe(
      "Engineering"
    );
  });

  it("falls back to team_name property", () => {
    expect(teamLabel({ ...baseUser, team_name: "Design" } as User)).toBe("Design");
  });

  it("returns default when no team info", () => {
    expect(teamLabel(baseUser)).toBe("No team");
  });
});

describe("userDisplayName", () => {
  it("returns full_name when available", () => {
    expect(userDisplayName(baseUser)).toBe("Alice Smith");
  });

  it("falls back to first and last name", () => {
    expect(userDisplayName({ ...baseUser, full_name: undefined } as User)).toBe("Alice Smith");
  });

  it("falls back to username when names missing", () => {
    expect(userDisplayName({ id: 2, username: "bob" } as User)).toBe("bob");
  });

  it("trims whitespace from partial names", () => {
    expect(userDisplayName({ id: 3, username: "carol", first_name: "Carol" } as User)).toBe(
      "Carol"
    );
  });
});
