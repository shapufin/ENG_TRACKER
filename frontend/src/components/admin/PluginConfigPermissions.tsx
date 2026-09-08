import React, { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Users, LockKeyhole, Info, UserCog, Plus, X, Search } from "lucide-react";
import type { PluginConfigPermissionsProps, PluginPermissionRecord } from "./pluginConfigTypes";
import type { Group } from "@/types";

const ROLE_CATEGORIES = [
  {
    key: "employee",
    label: "Employee",
    description: "Own personal data and actions.",
    codes: ["employee"],
  },
  {
    key: "team_leader",
    label: "Team Leader",
    description: "Italian or Albanian team leadership.",
    codes: ["italian_tl", "albanian_tl"],
  },
  { key: "hr", label: "HR", description: "Organization-wide HR visibility.", codes: ["hr"] },
  {
    key: "cr_admin",
    label: "Control Room Admin",
    description: "Manage Control Room access.",
    codes: ["cr_admin"],
  },
] as const;

const ACTION_LABELS: Record<string, { label: string; description: string }> = {
  view: { label: "View", description: "Open plugin pages and read plugin data." },
  manage: { label: "Manage", description: "Create, update, approve, or import plugin data." },
  configure: { label: "Configure", description: "Change plugin-specific mappings or settings." },
  export: { label: "Export", description: "Download plugin data or generated reports." },
};

export const PluginConfigPermissions: React.FC<PluginConfigPermissionsProps> = ({
  permissions,
  roles,
  groups = [],
  isSuperuser = false,
  permissionActions,
  details,
  onPermissionUpdate,
  isPermissionUpdating = () => false,
}) => {
  const [addedGroupIds, setAddedGroupIds] = useState<Set<number>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  const getPerm = (action: string): PluginPermissionRecord =>
    permissions.find((p) => p.action === action) || {
      id: 0,
      plugin_name: "",
      action,
      is_public: false,
      allowed_roles: [],
      allowed_role_codes: [],
      allowed_groups: [],
    };

  const availableRoleCodes = new Set(roles.map((role) => role.code));
  const visibleRoles = ROLE_CATEGORIES.filter((category) =>
    category.codes.some((code) => availableRoleCodes.has(code))
  );
  const actions = permissionActions.filter((action) => ACTION_LABELS[action]);

  // Admin-only plugin: all routes use layout "admin" (or no routes at all).
  // Non-admin role grants have no effect — SuperuserRoute blocks them.
  const routes = details?.metadata?.routes ?? [];
  const hasAppRoute = routes.some((r) => r.layout === "app");
  const isAdminOnly = routes.length > 0 && !hasAppRoute;

  const updateRoleCategory = (action: string, codes: readonly string[], checked: boolean) => {
    const perm = getPerm(action);
    const currentCodes = new Set(perm.allowed_role_codes || []);
    codes.forEach((code) => (checked ? currentCodes.add(code) : currentCodes.delete(code)));
    onPermissionUpdate(action, { allowed_role_codes: [...currentCodes] });
  };

  const updateGroupSelection = (action: string, groupId: number, checked: boolean) => {
    const perm = getPerm(action);
    const currentIds = new Set(perm.allowed_groups || []);
    if (checked) currentIds.add(groupId);
    else currentIds.delete(groupId);
    onPermissionUpdate(action, { allowed_groups: [...currentIds] });
  };

  // Groups that have at least one action granted across any permission record.
  const grantedGroupIds = useMemo(() => {
    const ids = new Set<number>();
    permissions.forEach((p) => (p.allowed_groups || []).forEach((id) => ids.add(id)));
    return ids;
  }, [permissions]);

  // Visible groups = granted + locally added (not yet saved).
  const visibleGroupIds = useMemo(() => {
    const ids = new Set(grantedGroupIds);
    addedGroupIds.forEach((id) => ids.add(id));
    return ids;
  }, [grantedGroupIds, addedGroupIds]);

  const visibleGroups = useMemo(
    () => groups.filter((g) => visibleGroupIds.has(g.id)),
    [groups, visibleGroupIds]
  );

  const availableGroups = useMemo(() => {
    const search = groupSearch.trim().toLowerCase();
    return groups
      .filter((g) => !visibleGroupIds.has(g.id))
      .filter(
        (g) =>
          !search || g.name.toLowerCase().includes(search) || g.code.toLowerCase().includes(search)
      );
  }, [groups, visibleGroupIds, groupSearch]);

  const handleAddGroup = (group: Group) => {
    setAddedGroupIds((prev) => new Set(prev).add(group.id));
    setGroupSearch("");
    setAddPopoverOpen(false);
  };

  const handleRemoveGroup = (groupId: number) => {
    // Remove from all actions' allowed_groups.
    actions.forEach((action) => {
      const perm = getPerm(action);
      if ((perm.allowed_groups || []).includes(groupId)) {
        onPermissionUpdate(action, {
          allowed_groups: (perm.allowed_groups || []).filter((id) => id !== groupId),
        });
      }
    });
    // Remove from local added set.
    setAddedGroupIds((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  };

  const groupControlsDisabled = !isSuperuser || isAdminOnly;

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Who can use this plugin?
            </p>
            <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
              Select access by functional user category. Admins and superusers always have full
              access and are managed by the application admin role, not by this matrix.
            </p>
          </div>
        </div>
      </div>

      {isAdminOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            This plugin is admin-only — all its pages are under{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">/admin/*</code> and
            protected by the admin route guard. Granting access to Employee, Team Leader, HR, or
            Control Room Admin roles below has no effect; those users cannot reach the plugin pages
            regardless of this permission.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <div
          className="grid grid-cols-[minmax(0,1fr)_repeat(var(--permission-columns),minmax(5.5rem,0.7fr))] items-center gap-3 border-b bg-muted/40 px-4 py-3"
          style={{ "--permission-columns": actions.length } as React.CSSProperties}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            User category
          </div>
          {actions.map((action) => (
            <div
              key={action}
              className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {ACTION_LABELS[action].label}
            </div>
          ))}
        </div>
        {visibleRoles.map((category) => (
          <div
            key={category.key}
            className="grid grid-cols-[minmax(0,1fr)_repeat(var(--permission-columns),minmax(5.5rem,0.7fr))] items-center gap-3 border-b px-4 py-3 last:border-b-0"
            style={{ "--permission-columns": actions.length } as React.CSSProperties}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{category.label}</p>
              <p className="truncate text-xs text-muted-foreground" title={category.description}>
                {category.description}
              </p>
            </div>
            {actions.map((action) => {
              const perm = getPerm(action);
              const selectedCodes = perm.allowed_role_codes || [];
              const checked = category.codes.some((code) => selectedCodes.includes(code));
              return (
                <div key={action} className="flex justify-center">
                  <Checkbox
                    aria-label={`${category.label} ${ACTION_LABELS[action].label}`}
                    checked={checked}
                    disabled={perm.is_public || isAdminOnly}
                    onCheckedChange={(value) =>
                      updateRoleCategory(action, category.codes, value === true)
                    }
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed p-3">
          <div className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Control Room users</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Regular Control Room users are granted access through their team scope, not this
                role matrix.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-dashed p-3">
          <div className="flex gap-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium">Public access</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Allow every authenticated user. This overrides role selection for that action.
                </p>
              </div>
              {actions.map((action) => {
                const perm = getPerm(action);
                return (
                  <div key={action} className="flex items-center justify-between gap-2">
                    <Label htmlFor={`${action}-public`} className="text-xs">
                      {ACTION_LABELS[action].label}
                    </Label>
                    <Switch
                      id={`${action}-public`}
                      checked={perm.is_public}
                      onCheckedChange={(value) => onPermissionUpdate(action, { is_public: value })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex gap-2">
          <UserCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium">Group access</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Grant plugin actions to resource-access groups. Create groups and assign users on
                the Resource Access page. Only superusers can modify group grants.
                {!isSuperuser && (
                  <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                    (Read-only — superuser required to edit.)
                  </span>
                )}
              </p>
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No groups created yet. Visit{" "}
                <a href="/admin/resource-access" className="underline">
                  Resource Access
                </a>{" "}
                to create one.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Add group dropdown — only visible groups appear as rows. */}
                {isSuperuser && !isAdminOnly && availableGroups.length > 0 && (
                  <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Add group
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-80 p-0"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="border-b p-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={groupSearch}
                            onChange={(e) => setGroupSearch(e.target.value)}
                            placeholder="Search groups..."
                            className="pl-8"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {availableGroups.length === 0 ? (
                          <p className="p-3 text-xs text-muted-foreground">No groups match.</p>
                        ) : (
                          availableGroups.map((group) => (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => handleAddGroup(group)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium" title={group.name}>
                                  {group.name}
                                </span>
                                <span
                                  className="block truncate text-xs text-muted-foreground"
                                  title={group.code}
                                >
                                  {group.code}
                                </span>
                              </span>
                              <Plus className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Granted groups table — only groups with grants or locally added. */}
                {visibleGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No groups granted yet. Click <span className="font-medium">Add group</span> to
                    grant access to a group.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_repeat(var(--permission-columns),minmax(5.5rem,0.7fr))_2rem] items-center gap-3 border-b bg-muted/40 px-4 py-3"
                      style={{ "--permission-columns": actions.length } as React.CSSProperties}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Group
                      </div>
                      {actions.map((action) => (
                        <div
                          key={action}
                          className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {ACTION_LABELS[action].label}
                        </div>
                      ))}
                      <div />
                    </div>
                    {visibleGroups.map((group) => (
                      <div
                        key={group.id}
                        className="grid grid-cols-[minmax(0,1fr)_repeat(var(--permission-columns),minmax(5.5rem,0.7fr))_2rem] items-center gap-3 border-b px-4 py-3 last:border-b-0"
                        style={{ "--permission-columns": actions.length } as React.CSSProperties}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{group.name}</p>
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={`(${group.code})`}
                          >
                            ({group.code})
                          </p>
                        </div>
                        {actions.map((action) => {
                          const perm = getPerm(action);
                          const checked = (perm.allowed_groups || []).includes(group.id);
                          const disabled =
                            perm.is_public || groupControlsDisabled || isPermissionUpdating(action);
                          return (
                            <div key={action} className="flex justify-center">
                              <Checkbox
                                aria-label={`${group.name} ${ACTION_LABELS[action].label}`}
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(value) =>
                                  updateGroupSelection(action, group.id, value === true)
                                }
                              />
                            </div>
                          );
                        })}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveGroup(group.id)}
                            disabled={groupControlsDisabled}
                            aria-label={`Remove ${group.name}`}
                            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
