import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReportArchivePanel } from "./ReportArchivePanel";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../hooks/useReportArchive", () => ({ useReportArchive: () => state.value }));

const q = (data: unknown[], enabled = true) => ({
  data,
  isLoading: false,
  isError: false,
  enabled,
});

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ReportArchivePanel />
    </MemoryRouter>
  );

describe("ReportArchivePanel", () => {
  beforeEach(() => {
    state.value = { enabled: true, exports: q([]), schedules: q([]) };
  });

  it("renders nothing when disabled", () => {
    state.value = { enabled: false, exports: q([], false), schedules: q([], false) };
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders job rows with formatted size", () => {
    state.value = {
      enabled: true,
      exports: q([
        {
          job_id: 1,
          status: "completed",
          format: "excel",
          file_size_bytes: 2048,
          error_message: null,
          created_at: "2026-05-02T10:00:00Z",
          completed_at: null,
        },
      ]),
      schedules: q([
        { id: 1, name: "W", is_active: true, next_run_at: "2026-06-01T08:00:00Z" },
        { id: 2, name: "X", is_active: false, next_run_at: null },
      ]),
    };
    renderPanel();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Active schedules: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage in Analytics/ })).toHaveAttribute(
      "href",
      "/admin/analytics"
    );
  });

  it("shows a compact empty state for no exports", () => {
    renderPanel();
    expect(screen.getByText("No exports yet")).toBeInTheDocument();
  });
});
