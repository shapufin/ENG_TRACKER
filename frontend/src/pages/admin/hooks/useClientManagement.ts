import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { useFormErrorHandler } from "@/hooks/useFormErrorHandler";
import { toast } from "sonner";
import type { Client } from "@/types";

const EMPTY_FORM = { name: "", code: "", description: "" };

export const useClientManagement = () => {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null);
  const handleFormError = useFormErrorHandler(setFormErrors);

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
      qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
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
      qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
      setFormOpen(false);
      setFormErrors({});
    },
    onError: handleFormError,
  });

  const deleteMutation = useMutation({
    mutationFn: overtimeService.deleteClient,
    onSuccess: () => {
      toast.success("Client deleted");
      qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
      setConfirmDelete(null);
    },
    onError: (err: unknown) => handleApiError(err),
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
    confirmDelete,
    setConfirmDelete,
    createMutation,
    updateMutation,
    deleteMutation,
    handleSubmit,
    openEdit,
    openCreate,
    updateField,
    refetch: () => qc.invalidateQueries({ queryKey: ["overtime", "clients"] }),
  };
};
