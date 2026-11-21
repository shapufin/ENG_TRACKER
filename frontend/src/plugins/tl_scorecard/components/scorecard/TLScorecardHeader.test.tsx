import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TLScorecardHeader, type TLScorecardTab } from "./TLScorecardHeader";
import { userService } from "@/services/userService";
import type { ScorecardTargets } from "../../types/tlScorecard";

vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn() },
}));

const MEMBERS = [1, 2, 3, 4, 5, 6].map((id) => ({
  user: { id, full_name: `Member${id} Person`, username: `member${id}` },
}));

const renderHeader = (tab: TLScorecardTab = "overview") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTabChange = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TLScorecardHeader
          subtitle="October 2026 · 6 team member(s)"
          tab={tab}
          onTabChange={onTabChange}
        >
          <div>child</div>
        </TLScorecardHeader>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { onTabChange };
};

describe("TLScorecardHeader (mockup button hierarchy)", () => {
  it("offers Export Summary next to Visualize", async () => {
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([]);
    renderHeader();
    expect(await screen.findByRole("button", { name: /export summary/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /visualize/i })).toBeDefined();
  });

  it("shows the direct-report avatar stack with overflow count", async () => {
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue(MEMBERS as never);
    renderHeader();
    await waitFor(() => {
      // First four members render initials; the rest collapse to +N.
      expect(screen.getByText("+2")).toBeDefined();
    });
  });

  it("switches between the three tabs", async () => {
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([]);
    const { onTabChange } = renderHeader();
    expect(await screen.findByRole("tab", { name: "Overview" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Records" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Partnership log" })).toBeDefined();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Partnership log" }));
    expect(onTabChange).toHaveBeenCalledWith("evidence");
  });

  it("keeps the guide button out of the Export + Visualize pair and lets the row wrap on tablets", async () => {
    // Browser pass 2026-11-21: at 320px the guide button pushed Visualize off-screen, and
    // at 768px (sidebar open) `sm:flex-nowrap` clipped the whole action cluster.
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TLScorecardHeader
            tab="overview"
            onTabChange={vi.fn()}
            targets={{
              tl_sync_per_year: 26,
              reviews_per_year: 12,
              one_on_one_pct: 100,
              promotion_pct: 3,
            }}
          >
            <div>child</div>
          </TLScorecardHeader>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const guide = screen.getByRole("button", { name: "How the scorecard is measured" });
    const exportButton = screen.getByRole("button", { name: /export summary/i });
    const visualize = screen.getByRole("link", { name: /visualize/i });
    const pair = visualize.parentElement;
    expect(pair).not.toBeNull();
    expect(pair!.contains(exportButton)).toBe(true);
    expect(pair!.contains(guide)).toBe(false);
    const row = pair!.parentElement!;
    expect(row.className).not.toMatch(/(^|\s)sm:flex-nowrap(\s|$)/);
  });

  it("does not render the guide button when targets prop is missing", async () => {
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([]);
    renderHeader();
    expect(screen.queryByRole("button", { name: "How the scorecard is measured" })).toBeNull();
  });

  it("renders the guide button when targets prop is present and toggles dialog with Escape restoring focus", async () => {
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onTabChange = vi.fn();
    const targets: ScorecardTargets = {
      tl_sync_per_year: 26,
      tl_sync_full_year: 45,
      reviews_per_year: 12,
      one_on_one_pct: 100,
      promotion_pct: 3,
      ot_within_sla_pct: 100,
    };

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TLScorecardHeader
            subtitle="October 2026 · 6 team member(s)"
            tab="overview"
            onTabChange={onTabChange}
            targets={targets}
          >
            <div>child</div>
          </TLScorecardHeader>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: "How the scorecard is measured" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "How the scorecard is measured");

    // Open dialog
    button.focus();
    fireEvent.click(button);

    // Dialog is visible
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How the scorecard is measured" })
    ).toBeInTheDocument();

    // Close on Escape
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    // Focus returns to the opener button
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(button).toHaveFocus();
  });
});
