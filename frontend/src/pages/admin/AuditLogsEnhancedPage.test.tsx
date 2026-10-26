import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditLogsEnhancedPage } from "./AuditLogsEnhancedPage";
import { auditService } from "@/services/auditService";

vi.mock("@/services/auditService", () => ({
  auditService: {
    getLogs: vi.fn(),
    getStats: vi.fn(),
    getArchiveStatus: vi.fn(),
    archivePreviousMonth: vi.fn(),
    downloadArchive: vi.fn(),
  },
}));

vi.mock("@/lib/download", () => ({
  downloadBlobResponse: vi.fn(),
}));

vi.mock("@/components/auth/PluginPermissionGuard", () => ({
  PluginPermissionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("AuditLogsEnhancedPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(auditService.getLogs).mockResolvedValue({
      results: [],
      count: 0,
    } as any);

    vi.mocked(auditService.getStats).mockResolvedValue({
      total_logs: 0,
      logs_today: 0,
      logs_this_week: 0,
      logs_this_month: 0,
      unique_users: 0,
      failed_actions: 0,
      success_rate: 100,
    });

    vi.mocked(auditService.getArchiveStatus).mockResolvedValue({
      target_month: "2026-09",
      target_month_label: "September 2026",
      eligible_count: 42,
      core_count: 40,
      plugin_count: 2,
      archives: [
        {
          filename: "audit_logs_2026_08.json.gz",
          size_bytes: 5120,
          size_formatted: "5.0 KB",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    });
  });

  it("renders page header and Archive Previous Month button", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuditLogsEnhancedPage />
      </QueryClientProvider>
    );

    expect(screen.getByText("Audit Logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive previous month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export logs/i })).toBeInTheDocument();
  });

  it("opens archive confirmation dialog on click and displays eligible record count", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuditLogsEnhancedPage />
      </QueryClientProvider>
    );

    const archiveBtn = screen.getByRole("button", { name: /archive previous month/i });
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Archive & Rotate Logs for September 2026/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/42 records \(Core: 40, Plugin: 2\)/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /archive & download \(42 records\)/i })
    ).toBeInTheDocument();
  });

  it("executes archive mutation and triggers download", async () => {
    vi.mocked(auditService.archivePreviousMonth).mockResolvedValue({
      success: true,
      archived_count: 42,
      filename: "audit_logs_2026_09.json.gz",
      month: "2026-09",
      month_label: "September 2026",
      size_bytes: 8192,
      size_formatted: "8.0 KB",
    });
    vi.mocked(auditService.downloadArchive).mockResolvedValue(new Blob());

    render(
      <QueryClientProvider client={queryClient}>
        <AuditLogsEnhancedPage />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /archive previous month/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /archive & download \(42 records\)/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /archive & download \(42 records\)/i }));

    await waitFor(() => {
      expect(auditService.archivePreviousMonth).toHaveBeenCalled();
      expect(auditService.downloadArchive).toHaveBeenCalledWith("audit_logs_2026_09.json.gz");
    });
  });
});
