import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { toast } from "sonner";
import { DashboardActionsMenu } from "./DashboardActionsMenu";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";

const h = vi.hoisted(() => ({ factoryRuns: 0, capture: vi.fn() }));

vi.mock("@/components/visualization/pdfExport", () => {
  h.factoryRuns++;
  return { captureChartsToPdf: h.capture };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "root", full_name: "Root Admin" } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const setup = (withSection = true) => {
  const ref = createRef<HTMLDivElement>();
  const handlers = { onApplyPreset: vi.fn(), onReset: vi.fn(), onCustomize: vi.fn() };
  render(
    <>
      <div ref={ref}>
        {withSection ? <div data-chart-section="a">chart</div> : <div>skeleton</div>}
      </div>
      <DashboardActionsMenu
        containerRef={ref}
        availableWidgets={AVAILABLE_WIDGETS}
        isSuperuser={false}
        {...handlers}
      />
    </>
  );
  return { ref, ...handlers };
};

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Dashboard actions" }));

beforeEach(() => {
  h.capture.mockReset();
  h.capture.mockResolvedValue(undefined);
  vi.mocked(toast.info).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("DashboardActionsMenu", () => {
  it("is one labelled menu button; its items are real menu items", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Dashboard actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByRole("menu", { name: "Dashboard actions" })).toBeInTheDocument();
    for (const name of [
      /customize dashboard/i,
      /approver view/i,
      /export pdf/i,
      /reset to default/i,
    ]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  it("moves focus into the menu and arrows/Home/End walk the items", () => {
    setup();
    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(items[items.length - 1]).toHaveFocus();
    fireEvent.keyDown(items[items.length - 1], { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "End" });
    expect(items[items.length - 1]).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    setup();
    openMenu();
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Dashboard actions" })).toHaveFocus();
  });

  it("Customize dashboard fires its handler and closes the menu", async () => {
    const { onCustomize } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /customize dashboard/i }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("lists presets with descriptions and asks before applying one", () => {
    const { onApplyPreset } = setup();
    openMenu();
    expect(screen.getByText(/Pending queue, aging/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Approver view/ }));
    expect(screen.getByText(/Switch to “Approver view”\?/)).toBeInTheDocument();
    expect(onApplyPreset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply preset" }));
    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset.mock.calls[0][0]).toEqual([
      "pending-approvals",
      "pending-backlog",
      "approval-aging",
      "approver-sla",
      "rejection-analysis",
      "period-close",
      "approval-status",
    ]);
  });

  it("cancelling a preset leaves the layout alone", () => {
    const { onApplyPreset } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Workforce view/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApplyPreset).not.toHaveBeenCalled();
  });

  it("reset asks for confirmation before resetting", () => {
    const { onReset } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /reset to default/i }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("cancelling the reset keeps the layout", () => {
    const { onReset } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /reset to default/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onReset).not.toHaveBeenCalled();
  });

  it("does not load the pdf library until Export PDF is chosen", () => {
    setup();
    openMenu();
    expect(h.factoryRuns).toBe(0);
  });

  it("exports the container with title, dated filename and the user name", async () => {
    const { ref } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /export pdf/i }));
    await waitFor(() => expect(h.capture).toHaveBeenCalledTimes(1));
    const [container, opts] = h.capture.mock.calls[0];
    expect(container).toBe(ref.current);
    expect(opts.title).toBe("Admin Dashboard");
    expect(opts.filename).toMatch(/^admin-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(opts.generatedBy).toBe("Root Admin");
  });

  it("tells the user when there is nothing to export", async () => {
    setup(false);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /export pdf/i }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/nothing to export/i))
    );
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("reports a failed export", async () => {
    h.capture.mockRejectedValue(new Error("boom"));
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /export pdf/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
