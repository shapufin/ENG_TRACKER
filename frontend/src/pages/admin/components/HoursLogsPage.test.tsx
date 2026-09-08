import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
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

function renderPage() {
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
});
