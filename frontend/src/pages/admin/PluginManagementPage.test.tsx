import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PluginManagementPage } from "./PluginManagementPage";

vi.mock("@/hooks/usePluginManagement", () => ({
  usePluginManagement: () => ({
    plugins: [],
    isLoading: false,
    isDiscovering: false,
    initializingId: null,
    selectedPlugin: null,
    configDialogOpen: false,
    setSelectedPlugin: vi.fn(),
    setConfigDialogOpen: vi.fn(),
    fetchPlugins: vi.fn(),
    handleToggle: vi.fn(),
    handleInitialize: vi.fn(),
    handleDiscover: vi.fn(),
    handlePluginLink: vi.fn(),
  }),
}));

vi.mock("@/components/admin/PluginManagementGrid", () => ({
  PluginManagementGrid: () => <div data-testid="plugin-grid" />,
}));

vi.mock("@/components/admin/PluginConfigDialog", () => ({
  PluginConfigDialog: () => <div data-testid="plugin-config-dialog" />,
}));

describe("PluginManagementPage mockup fidelity", () => {
  it("uses the mockup page-header treatment (font-black title, bottom border)", () => {
    render(<PluginManagementPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Plugin Management" });
    expect(title.className).toContain("text-2xl");
    expect(title.className).toContain("font-black");
    expect(title.className).not.toContain("sm:text-3xl");

    const headerRow = title.closest(".border-b");
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("pb-3");
    expect(headerRow?.className).toContain("border-line-subtle");
  });
});
