import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { useFormErrorHandler } from "@/hooks/useFormErrorHandler";
import { toast } from "sonner";
import type { Client } from "@/types";

const EMPTY_FORM = { name: "", code: "", description: "" };

/** Everything that lists or scopes by client; archiving or deleting one changes all of them. */
const CLIENT_QUERY_KEYS = [
  ["overtime", "clients"],
  ["overtime", "available-clients"],
  ["team", "members"],
  ["onboarding", "clients"],
] as const;

export const useClientManagement = () => {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<Client | null>(null);
  const handleFormError = useFormErrorHandler(setFormErrors);

  const invalidateClients = useCallback(() => {
    CLIENT_QUERY_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }));
  }, [qc]);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: overtimeService.createClient,
    onSuccess: () => {
      toast.success("Client created");
      invalidateClients();
      setFormOpen(false);
      setFormErrors({});
    },
    onError: handleFormError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Client> }) =>
      overtimeService.updateClient(id, payload),
    onSuccess: () => {
      toast.success("Client updated");
      invalidateClients();
      setFormOpen(false);
      setFormErrors({});
    },
    onError: handleFormError,
  });

  const archiveMutation = useMutation({
    mutationFn: overtimeService.archiveClient,
    onSuccess: (result) => {
      toast.success(
        `Client archived. ${result.users_unassigned} user${result.users_unassigned === 1 ? "" : "s"} unassigned.`
      );
      invalidateClients();
      setArchiveTarget(null);
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const unarchiveMutation = useMutation({
    mutationFn: overtimeService.unarchiveClient,
    onSuccess: () => {
      toast.success("Client restored. Assign it to users again where needed.");
      invalidateClients();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  // Only reachable from the archived-data dialog, and only for a client with no
  // records and no onboarding data; the server enforces the same rules.
  const deleteMutation = useMutation({
    mutationFn: overtimeService.deleteClient,
    onSuccess: () => {
      toast.success("Client deleted");
      invalidateClients();
      setLifecycleTarget(null);
    },
    onError: (err: unknown) => {
      const resp = (
        err as {
          response?: { status?: number; data?: { blockers?: string[]; detail?: string } };
        }
      )?.response;
      if (
        resp?.status === 409 &&
        Array.isArray(resp.data?.blockers) &&
        resp.data.blockers.length > 0
      ) {
        toast.error("Cannot delete client", {
          description: resp.data.blockers.join(" "),
          duration: 7000,
        });
        return;
      }
      handleApiError(err);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editing) updateMutation.mutate({ id: editing.id, payload: form });
      else createMutation.mutate(form);
    },
    [editing, form, updateMutation, createMutation]
  );

  const openEdit = useCallback((client: Client) => {
    setEditing(client);
    setForm({ name: client.name, code: client.code, description: client.description || "" });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const updateField = useCallback((key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  }, []);

  return {
    clients,
    isLoading,
    formOpen,
    setFormOpen,
    editing,
    form,
    formErrors,
    archiveTarget,
    setArchiveTarget,
    lifecycleTarget,
    setLifecycleTarget,
    createMutation,
    updateMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation,
    handleSubmit,
    openEdit,
    openCreate,
    updateField,
    refetch: () => qc.invalidateQueries({ queryKey: ["overtime", "clients"] }),
  };
};
