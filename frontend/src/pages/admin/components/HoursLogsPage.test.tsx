import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

function renderPage(
  onExport?: () => void | Promise<void>,
  setFilterStatus: (v: string) => void = () => {},
  onPageChange: (page: number) => void = () => {},
  bulk?: React.ComponentProps<typeof HoursLogsPage>["bulk"]
) {
  return render(
    <HoursLogsPage
      title="Overtime Logs"
      subtitle="Manage overtime entries"
      isLoading={false}
      filterStatus="all"
      setFilterStatus={setFilterStatus}
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
      total={120}
      page={1}
      onPageChange={onPageChange}
      onApprove={() => {}}
      onReject={() => {}}
      storageKey="test-storage"
      onExport={onExport}
      bulk={bulk}
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

  it("puts search, date range and Columns in one toolbar row, with status chips above it", () => {
    renderPage();
    const toolbar = document.querySelector("[data-filter-toolbar]") as HTMLElement;
    expect(within(toolbar).getByPlaceholderText("Search by user...")).toBeInTheDocument();
    expect(within(toolbar).getByText("Select date range")).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /columns/i })).toBeInTheDocument();
    const pending = screen.getByRole("button", { name: /pending/i });
    expect(toolbar.contains(pending)).toBe(false);
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

  it("filters status through count chips built from the loaded stats", () => {
    const setFilterStatus = vi.fn();
    renderPage(undefined, setFilterStatus);
    const pending = screen.getByRole("button", { name: /pending/i });
    expect(pending).toHaveTextContent("1");
    fireEvent.click(pending);
    expect(setFilterStatus).toHaveBeenCalledWith("pending");
  });

  it("names row actions per record: approve and reject for pending, no delete unless allowed", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Approve 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete 1" })).not.toBeInTheDocument();
  });

  it("pages on the server: shows the page count from the total and asks for the next page", () => {
    const onPageChange = vi.fn();
    renderPage(undefined, undefined, onPageChange);
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("has no row checkboxes without bulk actions", () => {
    renderPage();
    expect(screen.queryByRole("checkbox", { name: /select row/i })).not.toBeInTheDocument();
  });

  it("bulk-approves only the selected pending rows, then clears the selection", async () => {
    const approve = vi.fn().mockResolvedValue(true);
    renderPage(undefined, undefined, undefined, { approve, reject: vi.fn(), isPending: false });
    fireEvent.click(screen.getByRole("checkbox", { name: /select row/i }));
    fireEvent.click(await screen.findByRole("button", { name: /approve 1 pending/i }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith([1]));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /clear selection/i })).not.toBeInTheDocument()
    );
  });

  it("asks for a reason before bulk-rejecting", async () => {
    const reject = vi.fn().mockResolvedValue(true);
    renderPage(undefined, undefined, undefined, { approve: vi.fn(), reject, isPending: false });
    fireEvent.click(screen.getByRole("checkbox", { name: /select row/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    fireEvent.change(await screen.findByLabelText(/rejection reason/i), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm rejection/i }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith([1], "Duplicate"));
  });
});
