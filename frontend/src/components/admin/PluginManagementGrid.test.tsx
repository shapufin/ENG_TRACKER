import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PluginManagementGrid } from "./PluginManagementGrid";
import type { PluginRecord } from "@/services/pluginService";

const plugin = (overrides: Partial<PluginRecord> = {}): PluginRecord => ({
  id: 1,
  name: "analytics",
  verbose_name: "Analytics Plugin",
  description: "Dashboard analytics and metrics.",
  version: "1.0.0",
  is_enabled: true,
  config: {},
  created_at: "",
  updated_at: "",
  ...overrides,
});

const handlers = {
  onToggle: vi.fn(),
  onInitialize: vi.fn(),
  onConfigure: vi.fn(),
  onLink: vi.fn(),
};

const renderGrid = (
  plugins: PluginRecord[],
  overrides: Partial<Parameters<typeof PluginManagementGrid>[0]> = {}
) =>
  render(
    <PluginManagementGrid
      plugins={plugins}
      isLoading={false}
      initializingId={null}
      onToggle={handlers.onToggle}
      onInitialize={handlers.onInitialize}
      onConfigure={handlers.onConfigure}
      onLink={handlers.onLink}
      {...overrides}
    />
  );

describe("PluginManagementGrid", () => {
  it("renders one card per plugin", () => {
    renderGrid([
      plugin({ id: 1, verbose_name: "Analytics" }),
      plugin({ id: 2, verbose_name: "Audit Log", name: "audit_log" }),
      plugin({ id: 3, verbose_name: "Payroll", name: "payroll" }),
    ]);
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
  });

  it("renders version badge and active status for enabled plugin", () => {
    renderGrid([plugin({ is_enabled: true, version: "2.1.0" })]);
    // Badge uses CSS text-transform: uppercase; DOM text is lowercase "v".
    expect(screen.getByText("v2.1.0")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders inactive status for disabled plugin", () => {
    renderGrid([plugin({ id: 10, is_enabled: false, verbose_name: "Disabled One" })]);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("renders Open button only when plugin is enabled", () => {
    const { rerender } = render(
      <PluginManagementGrid
        plugins={[plugin({ is_enabled: true })]}
        isLoading={false}
        initializingId={null}
        {...handlers}
      />
    );
    expect(screen.getByRole("button", { name: /Open Analytics Plugin page/i })).toBeInTheDocument();

    rerender(
      <PluginManagementGrid
        plugins={[plugin({ id: 2, is_enabled: false, verbose_name: "Disabled" })]}
        isLoading={false}
        initializingId={null}
        {...handlers}
      />
    );
    expect(screen.queryByRole("button", { name: /Open Disabled page/i })).not.toBeInTheDocument();
  });

  it("fires onToggle when the switch is clicked", () => {
    renderGrid([plugin({ id: 5 })]);
    const toggle = screen.getByRole("switch", { name: /Toggle Analytics Plugin/i });
    fireEvent.click(toggle);
    expect(handlers.onToggle).toHaveBeenCalledWith(5);
  });

  it("fires onInitialize when the Initialize button is clicked", () => {
    renderGrid([plugin({ id: 7 })]);
    fireEvent.click(
      screen.getByRole("button", { name: /Initialize tables for Analytics Plugin/i })
    );
    expect(handlers.onInitialize).toHaveBeenCalledWith(7);
  });

  it("fires onConfigure when the Config button is clicked", () => {
    renderGrid([plugin({ id: 8 })]);
    fireEvent.click(screen.getByRole("button", { name: /Configure Analytics Plugin/i }));
    expect(handlers.onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
  });

  it("fires onLink when the Open button is clicked", () => {
    renderGrid([plugin({ id: 9 })]);
    fireEvent.click(screen.getByRole("button", { name: /Open Analytics Plugin page/i }));
    expect(handlers.onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("disables Initialize button for the plugin currently initializing", () => {
    renderGrid([plugin({ id: 1 }), plugin({ id: 2, verbose_name: "Second", name: "second" })], {
      initializingId: 1,
    });
    const initFirst = screen.getByRole("button", {
      name: /Initialize tables for Analytics Plugin/i,
    });
    const initSecond = screen.getByRole("button", { name: /Initialize tables for Second/i });
    expect(initFirst).toBeDisabled();
    expect(initSecond).not.toBeDisabled();
  });

  it("renders loading spinner when isLoading is true", () => {
    const { container } = renderGrid([], { isLoading: true });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("No plugins found")).not.toBeInTheDocument();
  });

  it("renders empty state when plugin list is empty", () => {
    renderGrid([]);
    expect(screen.getByText("No plugins found")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders description or fallback text", () => {
    renderGrid([plugin({ description: "" })]);
    expect(screen.getByText("No description provided.")).toBeInTheDocument();
  });

  it("frames each card with a decorative icon well and a status badge", () => {
    renderGrid([plugin({ is_enabled: true })]);
    expect(screen.getByRole("status", { name: "Active" })).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: "Analytics Plugin" });
    const card = heading.closest("div.relative") as HTMLElement;
    expect(card.querySelector('span[aria-hidden="true"] svg.lucide-puzzle')).toBeTruthy();
  });

  it("lays the cards out with an auto-fit grid so no column is left empty", () => {
    renderGrid([plugin()]);
    const heading = screen.getByRole("heading", { name: "Analytics Plugin" });
    const grid = heading.closest("div.relative")!.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(22rem, 1fr))");
  });

  it("explains Initialize in a tooltip on focus", async () => {
    renderGrid([plugin()]);
    screen.getByRole("button", { name: /Initialize tables for Analytics Plugin/i }).focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/creates the database tables/i);
  });
});
