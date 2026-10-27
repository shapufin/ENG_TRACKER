import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import axios from "axios";
import { useFormErrorHandler } from "@/hooks/useFormErrorHandler";
import { toast } from "sonner";
import type { Team } from "@/types";

const EMPTY_FORM = {
  name: "",
  code: "",
  description: "",
  team_leader_id: "",
  parent_team: "",
  calendar_group: "",
};

export const useTeamsPageForm = () => {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Team | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<Team | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const handleFormError = useFormErrorHandler(setFormErrors);

  const create = useMutation({
    mutationFn: (payload: Parameters<typeof userService.createTeam>[0]) =>
      userService.createTeam(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Created");
      setFormOpen(false);
      setForm({ ...EMPTY_FORM });
      setFormErrors({});
    },
    onError: handleFormError,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Team> }) =>
      userService.updateTeam(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
      toast.success("Updated");
      setFormOpen(false);
      setEditing(null);
      setFormErrors({});
    },
    onError: handleFormError,
  });

  // Archiving unassigns members, so user lists and team pickers are stale too.
  const invalidateTeamData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "calendar-groups"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userService.deleteTeam(id),
    onSuccess: () => {
      invalidateTeamData();
      toast.success("Team deleted");
      setConfirmDelete(null);
      setLifecycleTarget(null);
    },
    onError: (err: unknown) => {
      // A team with members, sub-teams or metrics answers 409 with the reasons: show them
      // and offer the archive path instead of a generic failure.
      const blockers = axios.isAxiosError(err)
        ? (err.response?.data?.blockers as string[] | undefined)
        : undefined;
      if (axios.isAxiosError(err) && err.response?.status === 409 && blockers?.length) {
        toast.error("This team cannot be deleted", { description: blockers.join(" ") });
        setConfirmDelete(null);
        return;
      }
      handleApiError(err);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => userService.archiveTeam(id),
    onSuccess: (result) => {
      invalidateTeamData();
      toast.success(
        `Team archived. ${result.members_unassigned} member${result.members_unassigned === 1 ? "" : "s"} unassigned.`
      );
      setArchiveTarget(null);
    },
    onError: (err: unknown) => {
      const blockers = axios.isAxiosError(err)
        ? (err.response?.data?.blockers as string[] | undefined)
        : undefined;
      if (blockers?.length) {
        toast.error("This team cannot be archived yet", { description: blockers.join(" ") });
        return;
      }
      handleApiError(err);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: number) => userService.unarchiveTeam(id),
    onSuccess: () => {
      invalidateTeamData();
      toast.success("Team restored. Its former members were not re-added.");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((team: Team) => {
    setEditing(team);
    setForm({
      name: team.name,
      code: team.code,
      description: team.description || "",
      team_leader_id: team.team_leader ? String(team.team_leader.id) : "",
      parent_team: team.parent_team ? String(team.parent_team) : "",
      calendar_group: team.calendar_group || "",
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description,
      team_leader_id: form.team_leader_id ? Number(form.team_leader_id) : null,
      parent_team_id: form.parent_team ? Number(form.parent_team) : null,
      calendar_group: form.calendar_group || "",
    };
    if (editing) update.mutate({ id: editing.id, payload });
    else create.mutate(payload);
  };

  return {
    formOpen,
    setFormOpen,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
    archiveTarget,
    setArchiveTarget,
    lifecycleTarget,
    setLifecycleTarget,
    archiveMutation,
    unarchiveMutation,
    form,
    setForm,
    formErrors,
    setFormErrors,
    create,
    update,
    deleteMutation,
    openCreate,
    openEdit,
    handleSubmit,
  };
};
