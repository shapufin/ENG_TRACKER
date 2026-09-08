import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PluginConfigDialog } from "./PluginConfigDialog";
import * as usePluginConfigDialog from "./hooks/usePluginConfigDialog";
import type { PluginRecord } from "@/services/pluginService";

vi.mock("./hooks/usePluginConfigDialog", () => ({
  usePluginConfigDialog: vi.fn(),
}));
vi.mock("./PluginConfigSettings", () => ({
  PluginConfigSettings: () => <div data-testid="config-settings" />,
}));
vi.mock("./PluginConfigPermissions", () => ({
  PluginConfigPermissions: () => <div data-testid="config-permissions" />,
}));

type HookResult = ReturnType<typeof usePluginConfigDialog.usePluginConfigDialog>;

const baseHook: HookResult = {
  details: null,
  config: {},
  isLoading: false,
  isSaving: false,
  permissions: [],
  roles: [],
  permissionActions: ["view", "manage"],
  isPermissionsLoading: false,
  handleConfigChange: vi.fn(),
  handlePermissionUpdate: vi.fn(),
  handleSave: vi.fn(),
} as unknown as HookResult;

const plugin = {
  id: "plugin-1",
  verbose_name: "Test Plugin",
  version: "1.0",
} as unknown as PluginRecord;

describe("PluginConfigDialog", () => {
  it("returns null when no plugin", () => {
    vi.mocked(usePluginConfigDialog.usePluginConfigDialog).mockReturnValue(baseHook);
    const { container } = render(
      <PluginConfigDialog
        plugin={null}
        open={true}
        onOpenChange={vi.fn()}
        onConfigSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loading state", () => {
    vi.mocked(usePluginConfigDialog.usePluginConfigDialog).mockReturnValue({
      ...baseHook,
      isLoading: true,
    });
    render(
      <PluginConfigDialog
        plugin={plugin}
        open={true}
        onOpenChange={vi.fn()}
        onConfigSaved={vi.fn()}
      />
    );
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders config and permissions tabs", () => {
    vi.mocked(usePluginConfigDialog.usePluginConfigDialog).mockReturnValue(baseHook);
    render(
      <PluginConfigDialog
        plugin={plugin}
        open={true}
        onOpenChange={vi.fn()}
        onConfigSaved={vi.fn()}
      />
    );
    expect(screen.getByText("Test Plugin Configuration")).toBeInTheDocument();
    expect(screen.getByTestId("config-settings")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  it("calls save and cancel handlers", () => {
    const onOpenChange = vi.fn();
    vi.mocked(usePluginConfigDialog.usePluginConfigDialog).mockReturnValue(baseHook);
    render(
      <PluginConfigDialog
        plugin={plugin}
        open={true}
        onOpenChange={onOpenChange}
        onConfigSaved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Save Configuration"));
    expect(baseHook.handleSave).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
