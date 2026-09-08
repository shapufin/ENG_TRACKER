import { useState, useMemo, useCallback, useEffect } from "react";
import { useUserManagement } from "@/hooks/useUserManagement";
import { useUsersPageBulk } from "./useUsersPageBulk";
import { filterUsersByTL } from "./useUsersPageHelpers";
import { usePlugins } from "@/context/PluginContext";
import { usePermissions } from "@/context/PermissionContext";
import api from "@/lib/api";
import type { UserProfile } from "@/types";
import type { ControlRoomAccess } from "@/plugins/control_room/types";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";

type TLFilter = "all" | "italian_tl" | "albanian_tl" | "no_tl";

const MIN_PASSWORD_LENGTH = 6;

const emptyEditForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  teams: [] as number[],
  techs: [] as number[],
  albanian_tl: "none",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  is_cr_admin: false,
  roles: [] as string[],
  hire_date: "",
};
const emptyCreateForm = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  phone: "",
  teams: [] as number[],
  techs: [] as number[],
  albanian_tl: "none",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  is_cr_admin: false,
  roles: [] as string[],
};

export const useUsersPage = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ ...emptyEditForm });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<UserProfile | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [tlFilter, setTlFilter] = useState<TLFilter>("all");
  const [bulkCommandDrawerOpen, setBulkCommandDrawerOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetValue, setResetValue] = useState("");
  const { isCRAdmin, isAdmin, isHR, isTeamLeader, isSuperuser } = usePermissions();
  const {
    profiles,
    teams: teamsData,
    techs,
    italianTLs,
    albanianTLs,
    stats,
    isLoading,
    isError,
    error,
    updateMutation,
    createMutation: userCreateMutation,
    resetMutation,
    deleteMutation,
  } = useUserManagement({
    onUpdateSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setFormErrors({});
    },
    onCreateSuccess: () => {
      setCreateOpen(false);
      setCreateForm({ ...emptyCreateForm });
      setCreateErrors({});
    },
    onResetSuccess: () => {
      setResetOpen(false);
      setResetUserId(null);
      setResetValue("");
    },
    onDeleteSuccess: () => setConfirmDelete(null),
  });

  const filteredData = useMemo(
    () => filterUsersByTL(profiles || [], tlFilter),
    [profiles, tlFilter]
  );

  // --- Control Room plugin-aware badge/filter (zero hard plugin import) ---
  // The core UsersPage does NOT import any plugin code. It checks the plugin
  // context for active plugins and, when control_room is active, makes a
  // direct API call to the plugin's URL to resolve CR access for the visible
  // page of users. If the plugin is deactivated/removed, crActive becomes
  // false and the fetch never happens — no broken references.
  const { activePlugins } = usePlugins();
  const crActive = activePlugins.some((p) => p.name === "control_room");
  const isCROnlyAdmin =
    isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const [crOnly, setCrOnly] = useState(false);
  const [crAccessUserIds, setCrAccessUserIds] = useState<Set<number>>(new Set());
  const [crAccessByUserId, setCrAccessByUserId] = useState<Map<number, ControlRoomAccess>>(
    new Map()
  );

  const visibleUserIds = useMemo(() => filteredData.map((p) => p.user.id), [filteredData]);

  useEffect(() => {
    if (!crActive || visibleUserIds.length === 0) return;
    let cancelled = false;
    // Fetch ALL CR access records (active + inactive) for the visible page.
    // crAccessUserIds (active only) is derived client-side for the badge/filter.
    // crAccessByUserId (all) is used by the edit dialog, which must be able
    // to edit inactive users too.
    api
      .get("/plugins/control_room/access/", {
        params: { user_id__in: visibleUserIds.join(",") },
      })
      .then((res) => {
        if (cancelled) return;
        const records: ControlRoomAccess[] = Array.isArray(res.data) ? res.data : [];
        const activeIdSet = new Set(records.filter((a) => a.is_active).map((a) => a.user));
        const idMap = new Map(records.map((a) => [a.user, a]));
        setCrAccessUserIds(activeIdSet);
        setCrAccessByUserId(idMap);
      })
      .catch(() => {
        if (!cancelled) {
          setCrAccessUserIds(new Set());
          setCrAccessByUserId(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [crActive, visibleUserIds]);

  const crFilteredData = useMemo(() => {
    if (!crActive || !crOnly) return filteredData;
    return filteredData.filter((p) => crAccessUserIds.has(p.user.id));
  }, [crActive, crOnly, filteredData, crAccessUserIds]);

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
    (updater) => {
      setRowSelection((previous) => {
        const next = typeof updater === "function" ? updater(previous) : updater;
        const visibleIds = new Set(crFilteredData.map((profile) => String(profile.id)));
        return Object.fromEntries(
          Object.entries(next).filter(([id]) => visibleIds.has(id))
        );
      });
    },
    [crFilteredData]
  );

  const {
    selectedProfiles,
    bulkDeleteMutation,
    bulkUpdateMutation,
    handleBulkUpdate,
    handleBulkDelete,
  } = useUsersPageBulk({
    filteredData: crFilteredData,
    rowSelection,
    onClearSelection: () => setRowSelection({}),
    onCloseDrawer: () => {
      setBulkCommandDrawerOpen(false);
      setBulkDeleteConfirmOpen(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate({
      id: editing.user.id,
      payload: {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        teams: form.teams,
        techs: form.techs,
        albanian_tl:
          form.albanian_tl && form.albanian_tl !== "none" ? Number(form.albanian_tl) : null,
        italian_tl: form.italian_tl && form.italian_tl !== "none" ? Number(form.italian_tl) : null,
        is_hr: form.is_hr_user,
        is_italian_tl_role: form.is_italian_tl_role,
        is_albanian_tl_role: form.is_albanian_tl_role,
        is_cr_admin: form.is_cr_admin,
        roles: [
          form.is_hr_user && "hr",
          form.is_italian_tl_role && "italian_tl",
          form.is_albanian_tl_role && "albanian_tl",
          form.is_cr_admin && "cr_admin",
        ].filter(Boolean) as string[],
        hire_date: form.hire_date || null,
      },
    });
  };

  // fallow-ignore-next-line complexity
  const openEdit = useCallback((profile: UserProfile) => {
    setEditing(profile);
    const roles = profile.user?.roles || [];
    setForm({
      first_name: profile.user.first_name || "",
      last_name: profile.user.last_name || "",
      email: profile.user.email || "",
      phone: profile.phone || "",
      teams: profile.teams || [],
      techs: profile.techs || [],
      albanian_tl: profile.albanian_tl ? String(profile.albanian_tl) : "none",
      italian_tl: profile.italian_tl ? String(profile.italian_tl) : "none",
      is_hr_user: profile.is_hr_user || roles.includes('hr'),
      is_italian_tl_role: profile.is_italian_tl_role || roles.includes('italian_tl'),
      is_albanian_tl_role: profile.is_albanian_tl_role || roles.includes('albanian_tl'),
      is_cr_admin: profile.user.is_cr_admin || false,
      roles: roles,
      hire_date: profile.hire_date || "",
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const openCreate = () => {
    setCreateForm({ ...emptyCreateForm });
    setCreateErrors({});
    setCreateOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    userCreateMutation.mutate({
      username: createForm.username,
      email: createForm.email,
      first_name: createForm.first_name,
      last_name: createForm.last_name,
      password: createForm.password,
      phone: createForm.phone,
      teams: createForm.teams,
      techs: createForm.techs,
      albanian_tl:
        createForm.albanian_tl && createForm.albanian_tl !== "none"
          ? Number(createForm.albanian_tl)
          : null,
      italian_tl:
        createForm.italian_tl && createForm.italian_tl !== "none"
          ? Number(createForm.italian_tl)
          : null,
      is_hr: createForm.is_hr_user,
      is_italian_tl_role: createForm.is_italian_tl_role,
      is_albanian_tl_role: createForm.is_albanian_tl_role,
      is_cr_admin: createForm.is_cr_admin,
      roles: [
        createForm.is_hr_user && "hr",
        createForm.is_italian_tl_role && "italian_tl",
        createForm.is_albanian_tl_role && "albanian_tl",
        createForm.is_cr_admin && "cr_admin",
      ].filter(Boolean) as string[],
    });
  };

  const openReset = useCallback((userId: number) => {
    setResetUserId(userId);
    setResetValue("");
    setResetOpen(true);
  }, []);

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetUserId && resetValue.length >= MIN_PASSWORD_LENGTH)
      resetMutation.mutate({ id: resetUserId, password: resetValue });
  };

  return {
    isLoading,
    isError,
    error,
    profiles,
    stats,
    teamsData,
    techs,
    italianTLs,
    albanianTLs,
    formOpen,
    setFormOpen,
    editing,
    form,
    setForm,
    formErrors,
    setFormErrors,
    confirmDelete,
    setConfirmDelete,
    rowSelection,
    setRowSelection,
    handleRowSelectionChange,
    tlFilter,
    setTlFilter,
    bulkCommandDrawerOpen,
    setBulkCommandDrawerOpen,
    bulkDeleteConfirmOpen,
    setBulkDeleteConfirmOpen,
    createOpen,
    setCreateOpen,
    createForm,
    setCreateForm,
    createErrors,
    setCreateErrors,
    resetOpen,
    setResetOpen,
    resetUserId,
    setResetUserId,
    resetValue,
    setResetValue,
    filteredData: crFilteredData,
    crActive,
    crOnly,
    setCrOnly,
    crAccessUserIds,
    crAccessByUserId,
    isCROnlyAdmin,
    selectedProfiles,
    updateMutation,
    userCreateMutation,
    resetMutation,
    deleteMutation,
    bulkDeleteMutation,
    bulkUpdateMutation,
    handleBulkUpdate,
    handleBulkDelete,
    handleSubmit,
    openEdit,
    openCreate,
    handleCreate,
    openReset,
    handleReset,
  };
};
