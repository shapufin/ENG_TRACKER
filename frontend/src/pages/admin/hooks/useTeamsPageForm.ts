import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
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
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const handleFormError = useFormErrorHandler(setFormErrors);

  const create = useMutation({
    mutationFn: (payload: Parameters<typeof userService.createTeam>[0]) =>
      userService.createTeam(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
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
      toast.success("Updated");
      setFormOpen(false);
      setEditing(null);
      setFormErrors({});
    },
    onError: handleFormError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userService.deleteTeam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      toast.success("Team deleted");
      setConfirmDelete(null);
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
