import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PluginImportButton } from "./PluginImportButton";

const getPluginComponent = vi.fn();
const activePlugins = vi.fn();

vi.mock("@/plugins", () => ({
  getPluginComponent: (...args: unknown[]) => getPluginComponent(...args),
}));

vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: activePlugins() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  activePlugins.mockReturnValue([{ name: "data_import" }]);
  getPluginComponent.mockReturnValue(({ targetKey }: { targetKey: string }) => (
    <button type="button">Import {targetKey}</button>
  ));
});

/**
 * Core admin pages must not import plugin code directly: a removed plugin
 * would break the build. This wrapper resolves the button through the plugin
 * registry so removal degrades to nothing rendered.
 */
describe("PluginImportButton", () => {
  it("renders the plugin's button when the plugin is active", async () => {
    render(<PluginImportButton targetKey="clients" />);
    expect(await screen.findByRole("button", { name: "Import clients" })).toBeInTheDocument();
  });

  it("renders nothing when the plugin is not active", () => {
    activePlugins.mockReturnValue([{ name: "skills" }]);
    const { container } = render(<PluginImportButton targetKey="clients" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the plugin code has been removed", async () => {
    getPluginComponent.mockReturnValue(null);
    const { container } = render(<PluginImportButton targetKey="clients" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("does not resolve the component at all while the plugin is inactive", () => {
    activePlugins.mockReturnValue([]);
    render(<PluginImportButton targetKey="clients" />);
    expect(getPluginComponent).not.toHaveBeenCalled();
  });

  it("passes its props through to the plugin component", async () => {
    render(
      <PluginImportButton
        targetKey="users"
        label="Import Users"
        invalidateKeys={[["admin", "users"]]}
      />
    );
    expect(getPluginComponent).toHaveBeenCalledWith("data_import", "ImportPageButton");
    expect(await screen.findByRole("button", { name: "Import users" })).toBeInTheDocument();
  });
});
