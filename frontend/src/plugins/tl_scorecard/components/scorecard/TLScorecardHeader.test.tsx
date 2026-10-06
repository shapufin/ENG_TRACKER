import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TLScorecardHeader, type TLScorecardTab } from "./TLScorecardHeader";
import { userService } from "@/services/userService";

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
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeDefined();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Evidence" }));
    expect(onTabChange).toHaveBeenCalledWith("evidence");
  });
});
