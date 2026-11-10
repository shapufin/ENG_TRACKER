import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HoursLogsTable } from "./HoursLogsTable";
import { timeRangeColumn } from "./standbyColumns";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";

const log = {
  id: 7,
  user_name: "Ada Lovelace",
  date: "2026-10-02",
  hours: 3,
  description: "Night cover",
  status: "pending",
  start_time: "22:00",
  end_time: "01:00",
};

describe("HoursLogsTable phone cards", () => {
  beforeEach(() => {
    localStorage.clear();
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders a log as a card with the time range and the approve/reject actions", () => {
    render(
      <HoursLogsTable
        logs={[log]}
        server={{ search: "", onSearchChange: vi.fn(), page: 1, total: 1, onPageChange: vi.fn() }}
        extraColumns={[timeRangeColumn as never]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        storageKey="test-hours-logs"
      />
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(card).getByText("3h")).toBeInTheDocument();
    expect(within(card).getByText(/22:00/)).toBeInTheDocument();
    expect(within(card).getByText("Night cover")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Approve 7" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Reject 7" })).toBeInTheDocument();
  });
});

describe("HoursLogsTable desktop column sizing", () => {
  beforeEach(() => {
    localStorage.clear();
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
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("allocates wider user/description columns, keeps time_range single-line, and keeps actions tight", () => {
    const { container } = render(
      <HoursLogsTable
        logs={[
          {
            ...log,
            description:
              "Very long admin overtime standby description that must truncate neatly inside the cell",
          },
        ]}
        server={{ search: "", onSearchChange: vi.fn(), page: 1, total: 1, onPageChange: vi.fn() }}
        extraColumns={[timeRangeColumn as never]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        canDelete
        onDelete={vi.fn()}
        storageKey="test-hours-logs-desktop"
      />
    );
    const headers = Array.from(container.querySelectorAll("thead th"));
    const userTh = headers.find((th) => th.textContent?.includes("User")) as HTMLElement;
    const actionsTh = headers.find((th) => th.textContent?.includes("Actions")) as HTMLElement;
    expect(parseInt(userTh.style.width, 10)).toBeGreaterThanOrEqual(170);
    expect(parseInt(actionsTh.style.width, 10)).toBeLessThanOrEqual(120);
    const timeBadge = screen.getByText(/22:00/);
    expect(timeBadge.className).toContain("whitespace-nowrap");
    expect(
      screen.getByRole("button", {
        name: "Very long admin overtime standby description that must truncate neatly inside the cell",
      }).className
    ).toContain("truncate");
  });
});
