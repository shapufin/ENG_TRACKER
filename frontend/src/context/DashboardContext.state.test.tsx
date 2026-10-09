import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { dashboardService } from "@/services/dashboardService";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDashboardLayout: vi.fn(),
    saveDashboardLayout: vi.fn(),
  },
}));

const Probe = () => {
  const { layout, isLoading, saveStatus, updateLayout, resetLayout, removeWidget } = useDashboard();
  const [resetOk, setResetOk] = useState("none");
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="status">{saveStatus}</span>
      <span data-testid="ids">{layout.widgets.map((w) => w.id).join(",")}</span>
      <span data-testid="md">{(layout.layouts?.md ?? []).map((p) => p.id).join(",")}</span>
      <span data-testid="reset">{resetOk}</span>
      <button
        onClick={() => {
          void updateLayout({ ...layout, columns: 12 });
          void updateLayout({ ...layout, columns: 12, version: 2 });
        }}
      >
        two saves
      </button>
      <button onClick={() => void updateLayout({ columns: 12, widgets: [] })}>update</button>
      <button onClick={() => void resetLayout().then((ok) => setResetOk(String(ok)))}>reset</button>
      <button onClick={() => removeWidget("shortcuts")}>remove</button>
    </div>
  );
};

const renderProvider = (type = "admin") =>
  render(
    <DashboardProvider dashboardType={type}>
      <Probe />
    </DashboardProvider>
  );

const loadedWith = (layout?: unknown) =>
  vi
    .mocked(dashboardService.getDashboardLayout)
    .mockResolvedValue(
      layout === undefined
        ? { count: 0, results: [] }
        : { count: 1, results: [{ id: 1, dashboard_type: "admin", layout }] }
    );

const settle = () =>
  waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

describe("DashboardProvider save status race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("an earlier failure does not mark the status failed once a later save succeeded", async () => {
    loadedWith();
    vi.mocked(dashboardService.saveDashboardLayout)
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValueOnce(undefined);
    renderProvider();
    await settle();
    act(() => screen.getByText("two saves").click());
    await waitFor(() => expect(dashboardService.saveDashboardLayout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("saved"));
  });

  it("a failure of the latest save is reported even when an earlier one succeeded", async () => {
    loadedWith();
    vi.mocked(dashboardService.saveDashboardLayout)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second fails"));
    renderProvider();
    await settle();
    act(() => screen.getByText("two saves").click());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
  });
});

describe("DashboardProvider malformed or unloaded state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["an empty object", {}],
    ["a non-array widgets value", { version: 2, columns: 12, widgets: "nope" }],
  ])("treats %s as no saved layout and keeps the default", async (_name, layout) => {
    loadedWith(layout);
    renderProvider();
    await settle();
    expect(screen.getByTestId("ids").textContent).toBe(
      defaultAdminLayout.widgets.map((w) => w.id).join(",")
    );
  });

  it("ignores edits made before the saved layout has loaded", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(dashboardService.getDashboardLayout).mockReturnValue(
      new Promise((r) => (release = r))
    );
    renderProvider();
    act(() => screen.getByText("update").click());
    expect(dashboardService.saveDashboardLayout).not.toHaveBeenCalled();
    await act(async () => release({ count: 0, results: [] }));
    expect(screen.getByTestId("ids").textContent).toContain("kpi-strip");
  });

  it("resetLayout resolves false when the save failed and true when it worked", async () => {
    loadedWith();
    vi.mocked(dashboardService.saveDashboardLayout)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    renderProvider();
    await settle();
    act(() => screen.getByText("reset").click());
    await waitFor(() => expect(screen.getByTestId("reset")).toHaveTextContent("false"));
    act(() => screen.getByText("reset").click());
    await waitFor(() => expect(screen.getByTestId("reset")).toHaveTextContent("true"));
  });

  it("does not save the admin default as the reset layout of another dashboard type", async () => {
    loadedWith();
    vi.mocked(dashboardService.saveDashboardLayout).mockResolvedValue(undefined);
    renderProvider("employee");
    await settle();
    act(() => screen.getByText("reset").click());
    await waitFor(() => expect(dashboardService.saveDashboardLayout).toHaveBeenCalledTimes(1));
    expect(vi.mocked(dashboardService.saveDashboardLayout).mock.calls[0][0]).not.toEqual(
      defaultAdminLayout
    );
  });

  it("removing a widget also drops its stored md placement", async () => {
    loadedWith({
      version: 2,
      columns: 12,
      widgets: [
        { id: "shortcuts", position: { x: 0, y: 0 }, size: { w: 12, h: 1 } },
        { id: "kpi-strip", position: { x: 0, y: 1 }, size: { w: 12, h: 2 } },
      ],
      layouts: {
        md: [
          { id: "shortcuts", position: { x: 0, y: 0 }, size: { w: 6, h: 1 } },
          { id: "kpi-strip", position: { x: 0, y: 1 }, size: { w: 6, h: 2 } },
        ],
      },
    });
    vi.mocked(dashboardService.saveDashboardLayout).mockResolvedValue(undefined);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("shortcuts"));
    act(() => screen.getByText("remove").click());
    await waitFor(() => expect(screen.getByTestId("md").textContent).toBe("kpi-strip"));
  });
});
