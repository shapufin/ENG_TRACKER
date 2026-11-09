import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogsEnhancedPage } from "./AuditLogsEnhancedPage";
import { auditService } from "@/services/auditService";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";

vi.mock("@/services/auditService", () => ({
  auditService: { getLogs: vi.fn(), getStats: vi.fn(), getArchiveStatus: vi.fn() },
}));
vi.mock("@/components/auth/PluginPermissionGuard", () => ({
  PluginPermissionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AuditLogsEnhancedPage phone cards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows each log as a card with a Details button instead of a table", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === MOBILE_CARD_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    vi.mocked(auditService.getLogs).mockResolvedValue({
      results: [
        {
          id: 1,
          timestamp: "2026-11-01T10:00:00Z",
          user_name: "ada",
          action: "UPDATE",
          model_name_display: "Team",
          object_repr: "Alpha",
          ip_address: "10.0.0.1",
        },
      ],
      count: 1,
    } as never);
    vi.mocked(auditService.getStats).mockResolvedValue({} as never);
    vi.mocked(auditService.getArchiveStatus).mockResolvedValue({} as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuditLogsEnhancedPage />
      </QueryClientProvider>
    );

    const card = await screen.findByRole("listitem");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(card).getByText("ada")).toBeInTheDocument();
    expect(within(card).getByText("UPDATE")).toBeInTheDocument();
    expect(within(card).getByText("10.0.0.1")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "View log details" })).toBeInTheDocument();
  });
});
