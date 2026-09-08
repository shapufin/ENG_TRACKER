import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HoursLogExportButtons } from "./HoursLogExportButtons";

vi.mock("@/utils/exportUtils", () => ({
  exportData: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { exportData } from "@/utils/exportUtils";

interface Row {
  user: string;
  hours: number;
}

const logs: Row[] = [{ user: "alice", hours: 4 }];

describe("HoursLogExportButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports the provided logs when onFetchAll is not supplied", () => {
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
      />
    );
    fireEvent.click(screen.getByText("Export CSV"));
    expect(exportData).toHaveBeenCalledWith(logs, "ot", "csv", expect.any(Object));
  });

  it("awaits onFetchAll and exports the fetched rows", async () => {
    const fetched: Row[] = [
      { user: "alice", hours: 4 },
      { user: "bob", hours: 2.5 },
    ];
    const onFetchAll = vi.fn().mockResolvedValue(fetched);
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
        onFetchAll={onFetchAll}
      />
    );
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => {
      expect(exportData).toHaveBeenCalledWith(fetched, "ot", "csv", expect.any(Object));
    });
    expect(onFetchAll).toHaveBeenCalled();
  });

  it("calls onExportCsv for CSV and does not call exportData", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined);
    const onFetchAll = vi.fn().mockResolvedValue(logs);
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
        onFetchAll={onFetchAll}
        onExportCsv={onExportCsv}
      />
    );
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => expect(onExportCsv).toHaveBeenCalled());
    // exportData must NOT be called for CSV when onExportCsv is provided.
    expect(exportData).not.toHaveBeenCalled();
  });

  it("still uses onFetchAll + exportData for JSON when onExportCsv is provided", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined);
    const onFetchAll = vi.fn().mockResolvedValue(logs);
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
        onFetchAll={onFetchAll}
        onExportCsv={onExportCsv}
      />
    );
    fireEvent.click(screen.getByText("Export JSON"));
    await waitFor(() => expect(onFetchAll).toHaveBeenCalled());
    expect(exportData).toHaveBeenCalledWith(logs, "ot", "json");
    // onExportCsv must NOT be called for JSON.
    expect(onExportCsv).not.toHaveBeenCalled();
  });

  it("shows error toast when onExportCsv throws", async () => {
    const { toast } = await import("sonner");
    const onExportCsv = vi.fn().mockRejectedValue(new Error("Export failed"));
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
        onExportCsv={onExportCsv}
      />
    );
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => expect(onExportCsv).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("wraps the export action row on narrow screens", () => {
    const { container } = render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        csvHeaders={["User", "Hours"]}
        rowMapper={(l) => [l.user, String(l.hours)]}
      />
    );

    const actionRow = container.querySelector(".flex.justify-end");
    expect(actionRow).toBeInTheDocument();
    expect(actionRow?.className).toContain("flex-wrap");
  });
});
