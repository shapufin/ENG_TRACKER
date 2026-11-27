import { describe, expect, it } from "vitest";

// Every request-mutating path must refresh the Line Manager dashboard (workflow-invariants item 93).
const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const MUTATION =
  /(overtime|standby|leave)Service\s*\.\s*(approve|reject|bulkApprove|bulkReject|bulkDelete|deleteLog|deleteRequest)\b/;

// Files that mutate through a path that already refreshes ["dashboard"].
const COVERED_ELSEWHERE: Record<string, string> = {
  "/src/pages/overtime/OvertimePage.tsx": "bulkDelete goes through useBulkOperations",
  "/src/pages/standby/StandbyPage.tsx": "bulk calls end in useStandbyQueries.refetchStandbyData",
  "/src/pages/team/hooks/useTeamBulkActions.ts": "all calls go through useBulkOperations",
};

describe("dashboard invalidation guard", () => {
  const mutating = Object.entries(sources).filter(([, code]) => MUTATION.test(code));

  it("sees the mutating files", () => {
    expect(mutating.length).toBeGreaterThan(8);
  });

  it("every file that mutates a request refreshes the dashboard", () => {
    const missing = mutating
      .filter(([path, code]) => !code.includes('["dashboard"]') && !COVERED_ELSEWHERE[path])
      .map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it("the shared bulk and admin-reject hooks refresh it", () => {
    for (const path of [
      "/src/hooks/useBulkOperations.ts",
      "/src/hooks/useAdminRejectMutation.ts",
    ]) {
      expect(sources[path]).toContain('["dashboard"]');
    }
  });
});
