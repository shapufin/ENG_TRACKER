import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HoursLogsPage } from "./HoursLogsPage";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(onExport?: () => void | Promise<void>) {
  return render(
    <HoursLogsPage
      title="Overtime Logs"
      subtitle="Manage overtime entries"
      isLoading={false}
      filterStatus="all"
      setFilterStatus={() => {}}
      dateFrom=""
      setDateFrom={() => {}}
      dateTo=""
      setDateTo={() => {}}
      searchQuery=""
      setSearchQuery={() => {}}
      stats={{ total: 1, pending: 1, approved: 0, rejected: 0 }}
      filteredLogs={[
        { id: 1, user_name: "E2E Employee", date: "2026-08-01", hours: 2, status: "pending" },
      ]}
      onApprove={() => {}}
      onReject={() => {}}
      storageKey="test-storage"
      onExport={onExport}
    />
  );
}

describe("HoursLogsPage", () => {
  it("uses canonical GlassCard surfaces (no rounded-3xl deviations) for filter bar and table", () => {
    const { container } = renderPage();

    // The filter bar and table GlassCards converge to the base rounded-xl
    // surface; no ad-hoc rounded-3xl wrappers.
    expect(container.querySelector(".rounded-3xl")).toBeNull();
  });

  it("shows no export button unless onExport is provided", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
  });

  it("runs onExport once and disables the button while it is pending", async () => {
    let finish: () => void = () => {};
    const onExport = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderPage(onExport);
    const button = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("re-enables the button when the export fails", async () => {
    const onExport = vi.fn().mockRejectedValue(new Error("boom"));
    renderPage(onExport);
    const button = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(button);
    await waitFor(() => expect(onExport).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
