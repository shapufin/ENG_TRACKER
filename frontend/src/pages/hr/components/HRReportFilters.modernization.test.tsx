import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HRReportFilters } from "./HRReportFilters";

describe("HRReportFilters modernization", () => {
  it("uses a flat padded GlassCard filter surface", () => {
    const { container } = render(
      <HRReportFilters
        start=""
        onStartChange={() => {}}
        end=""
        onEndChange={() => {}}
        selectedItalianTL="all"
        onItalianTLChange={() => {}}
        selectedAlbanianTL="all"
        onAlbanianTLChange={() => {}}
        selectedTeam="all"
        onTeamChange={() => {}}
        selectedWorkspace="all"
        onWorkspaceChange={() => {}}
        isLoading={false}
        onGenerate={() => {}}
      />
    );

    const surface = container.querySelector("[class*='shadow-glass']");
    expect(surface?.className).toContain("p-4");
    expect(surface?.className).not.toContain("hover:-translate-y-1");
  });
});
