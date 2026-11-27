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
  const onCsv = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onExportCsv for CSV and does not call exportData", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined);
    const onFetchAll = vi.fn().mockResolvedValue(logs);
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
        onFetchAll={onFetchAll}
        onExportCsv={onExportCsv}
      />
    );
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => expect(onExportCsv).toHaveBeenCalled());
    // CSV is built by the server, never in the browser.
    expect(exportData).not.toHaveBeenCalled();
  });

  it("still uses onFetchAll + exportData for JSON when onExportCsv is provided", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined);
    const onFetchAll = vi.fn().mockResolvedValue(logs);
    render(
      <HoursLogExportButtons
        logs={logs}
        filename="ot"
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
    render(<HoursLogExportButtons logs={logs} filename="ot" onExportCsv={onExportCsv} />);
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => expect(onExportCsv).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("collapses both exports into one Export menu on phones", async () => {
    render(<HoursLogExportButtons logs={logs} filename="ot" onExportCsv={onCsv} />);

    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveClass("md:hidden");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "CSV" }));
    expect(onCsv).toHaveBeenCalled();
    // The trigger is disabled while the download runs.
    await waitFor(() => expect(trigger).toBeEnabled());

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "JSON" }));
    expect(exportData).toHaveBeenCalledWith(logs, "ot", "json");
  });

  it("wraps the export action row on narrow screens", () => {
    const { container } = render(
      <HoursLogExportButtons logs={logs} filename="ot" onExportCsv={onCsv} />
    );

    const actionRow = container.querySelector(".flex.justify-end");
    expect(actionRow).toBeInTheDocument();
    expect(actionRow?.className).toContain("flex-wrap");
  });
});
