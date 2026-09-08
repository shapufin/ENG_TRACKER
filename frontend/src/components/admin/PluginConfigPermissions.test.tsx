import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PluginConfigPermissions } from "./PluginConfigPermissions";
import type { PluginDetails } from "./pluginConfigTypes";

const roles = [
  { id: 1, code: "employee", name: "Employee" },
  { id: 2, code: "italian_tl", name: "Italian Team Leader" },
  { id: 3, code: "albanian_tl", name: "Albanian Team Leader" },
  { id: 4, code: "hr", name: "HR" },
  { id: 5, code: "cr_admin", name: "Control Room Admin" },
] as any;

const groups = [
  { id: 10, name: "Analytics Viewers", code: "ANL_VIEW" },
  { id: 11, name: "Payroll Editors", code: "PAY_EDIT" },
] as any;

const appPluginDetails: PluginDetails = {
  id: 1,
  name: "notifications",
  verbose_name: "Notifications",
  description: "",
  version: "1.0.0",
  is_enabled: true,
  config: {},
  config_schema: {},
  permission_actions: ["view", "manage"],
  metadata: {
    name: "notifications",
    verbose_name: "Notifications",
    description: "",
    version: "1.0.0",
    routes: [{ path: "/notifications", component: "NotificationsPage", layout: "app" }],
    injection_slots: [{ slot: "sidebar", component: "NotificationBell" }],
  },
};

const adminOnlyDetails: PluginDetails = {
  ...appPluginDetails,
  id: 2,
  name: "data_import",
  metadata: {
    ...appPluginDetails.metadata,
    name: "data_import",
    routes: [{ path: "/admin/data-import", component: "DataImportPage", layout: "admin" }],
    injection_slots: [],
  },
};

describe("PluginConfigPermissions", () => {
  it("groups TL role codes and renders only plugin capabilities", () => {
    render(
      <PluginConfigPermissions
        permissions={[]}
        roles={roles}
        permissionActions={["view", "manage"]}
        details={appPluginDetails}
        onPermissionUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("Team Leader")).toBeInTheDocument();
    expect(screen.queryByText("Italian Team Leader")).not.toBeInTheDocument();
    expect(screen.queryByText("Configure")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
    expect(screen.getByText("Control Room users")).toBeInTheDocument();
  });

  it("disables role access controls when an action is public", () => {
    render(
      <PluginConfigPermissions
        permissions={[
          {
            id: 1,
            plugin_name: "notifications",
            action: "view",
            is_public: true,
            allowed_roles: [],
            allowed_role_codes: [],
            allowed_groups: [],
          },
        ]}
        roles={roles}
        permissionActions={["view"]}
        details={appPluginDetails}
        onPermissionUpdate={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Employee View" })).toBeDisabled();
  });

  it("disables non-admin checkboxes and shows warning for admin-only plugins", () => {
    render(
      <PluginConfigPermissions
        permissions={[]}
        roles={roles}
        permissionActions={["view", "manage"]}
        details={adminOnlyDetails}
        onPermissionUpdate={vi.fn()}
      />
    );

    expect(screen.getByText(/This plugin is admin-only/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Employee View" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Team Leader View" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "HR View" })).toBeDisabled();
  });

  it("does not disable checkboxes for plugins with app-layout routes", () => {
    render(
      <PluginConfigPermissions
        permissions={[]}
        roles={roles}
        permissionActions={["view"]}
        details={appPluginDetails}
        onPermissionUpdate={vi.fn()}
      />
    );

    expect(screen.queryByText(/This plugin is admin-only/)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Employee View" })).not.toBeDisabled();
  });

  describe("group-based access", () => {
    it("shows add-group button and empty state when no groups are granted", () => {
      render(
        <PluginConfigPermissions
          permissions={[]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view", "manage"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      expect(screen.getByText(/No groups granted yet/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add group/ })).toBeInTheDocument();
      // Groups without grants should NOT appear as rows.
      expect(screen.queryByText("Analytics Viewers")).not.toBeInTheDocument();
      expect(screen.queryByText("Payroll Editors")).not.toBeInTheDocument();
    });

    it("shows granted groups as rows with checked actions", () => {
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      // Granted group appears as a row.
      expect(screen.getByText("Analytics Viewers")).toBeInTheDocument();
      // Non-granted group does NOT appear.
      expect(screen.queryByText("Payroll Editors")).not.toBeInTheDocument();

      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).toBeChecked();
    });

    it("adds a group via the dropdown and toggles its action", () => {
      const onPermissionUpdate = vi.fn();
      render(
        <PluginConfigPermissions
          permissions={[]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={onPermissionUpdate}
        />
      );

      // Open the add-group dropdown.
      fireEvent.click(screen.getByRole("button", { name: /Add group/ }));
      // Click the first available group.
      fireEvent.click(screen.getByText("Analytics Viewers"));

      // Group now appears as a row with unchecked action.
      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).not.toBeChecked();

      // Toggle the action.
      fireEvent.click(groupCheckbox);
      expect(onPermissionUpdate).toHaveBeenCalledWith("view", { allowed_groups: [10] });
    });

    it("maintains independent group selections per action", () => {
      const onPermissionUpdate = vi.fn();
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
            {
              id: 2,
              plugin_name: "notifications",
              action: "manage",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view", "manage"]}
          details={appPluginDetails}
          onPermissionUpdate={onPermissionUpdate}
        />
      );

      const viewCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      const manageCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*Manage/ });
      expect(viewCheckbox).toBeChecked();
      expect(manageCheckbox).not.toBeChecked();
    });

    it("shows empty state when no groups exist at all", () => {
      render(
        <PluginConfigPermissions
          permissions={[]}
          roles={roles}
          groups={[]}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      expect(screen.getByText(/No groups created yet/)).toBeInTheDocument();
    });

    it("disables group controls when action is public", () => {
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: true,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).toBeDisabled();
    });

    it("disables group controls for non-superusers", () => {
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={false}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).toBeDisabled();
    });

    it("disables group controls for admin-only plugins", () => {
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "data_import",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={adminOnlyDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).toBeDisabled();
    });

    it("removes a group from allowed_groups when unchecking", () => {
      const onPermissionUpdate = vi.fn();
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={onPermissionUpdate}
        />
      );

      const groupCheckbox = screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ });
      expect(groupCheckbox).toBeChecked();
      fireEvent.click(groupCheckbox);

      expect(onPermissionUpdate).toHaveBeenCalledWith("view", { allowed_groups: [] });
    });

    it("removes a group entirely via the remove button", () => {
      const onPermissionUpdate = vi.fn();
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
            {
              id: 2,
              plugin_name: "notifications",
              action: "manage",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view", "manage"]}
          details={appPluginDetails}
          onPermissionUpdate={onPermissionUpdate}
        />
      );

      // Remove the group entirely.
      fireEvent.click(screen.getByRole("button", { name: /Remove Analytics Viewers/ }));

      // Should call onPermissionUpdate for both actions to remove the group.
      expect(onPermissionUpdate).toHaveBeenCalledWith("view", { allowed_groups: [] });
      expect(onPermissionUpdate).toHaveBeenCalledWith("manage", { allowed_groups: [] });
    });

    it("disables an action while its permission update is pending", () => {
      render(
        <PluginConfigPermissions
          permissions={[
            {
              id: 1,
              plugin_name: "notifications",
              action: "view",
              is_public: false,
              allowed_roles: [],
              allowed_role_codes: [],
              allowed_groups: [10],
            },
          ]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
          isPermissionUpdating={(action) => action === "view"}
        />
      );

      expect(screen.getByRole("checkbox", { name: /Analytics Viewers.*View/ })).toBeDisabled();
    });

    it("filters available groups by search in the dropdown", () => {
      render(
        <PluginConfigPermissions
          permissions={[]}
          roles={roles}
          groups={groups}
          isSuperuser={true}
          permissionActions={["view"]}
          details={appPluginDetails}
          onPermissionUpdate={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Add group/ }));

      // Type a search that matches only one group.
      const searchInput = screen.getByPlaceholderText("Search groups...");
      fireEvent.change(searchInput, { target: { value: "Payroll" } });

      // Only "Payroll Editors" should be visible in the dropdown.
      expect(screen.getByText("Payroll Editors")).toBeInTheDocument();
      expect(screen.queryByText("Analytics Viewers")).not.toBeInTheDocument();
    });
  });
});
