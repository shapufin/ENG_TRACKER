import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { EvidenceType } from "../../types/ticketKPI";
import type { Client } from "@/types";

export interface UseTicketKPIEvidenceOptions {
  month: string;
  userId?: number;
}

export const useTicketKPIEvidence = ({ month, userId }: UseTicketKPIEvidenceOptions) => {
  const { user } = useAuth();
  const { isTeamLeader, isAdmin, isSuperuser } = usePermissions();
  const queryClient = useQueryClient();

  const effectiveUserId = userId ?? user?.id;

  const canReview = isAdmin || isSuperuser || isTeamLeader;

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<EvidenceType>("document");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

  const {
    data: evidence = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["ticket_kpi", "evidence", month, effectiveUserId],
    queryFn: () =>
      ticketKPIService.getEvidence({
        month,
        user_id: effectiveUserId,
      }),
    enabled: !!user,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
    staleTime: 5 * 60 * 1000,
  });

  const availableClients = useMemo<Client[]>(() => {
    const userClientIds = user?.client_ids;
    if (!userClientIds || userClientIds.length === 0) return clients;
    const allowed = new Set(userClientIds);
    return clients.filter((c) => allowed.has(c.id));
  }, [clients, user?.client_ids]);

  const resetForm = () => {
    setSelectedType("document");
    setDescription("");
    setFile(null);
    setSelectedClientIds([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", file);
      form.append("month", month);
      form.append("evidence_type", selectedType);
      form.append("description", description);
      selectedClientIds.forEach((id) => form.append("client_ids", String(id)));
      const { data } = await ticketKPIService.createEvidence(form);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "evidence"] });
      resetForm();
      setIsUploadOpen(false);
    },
    onError: handleApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ticketKPIService.deleteEvidence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "evidence"] });
    },
    onError: handleApiError,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      ticketKPIService.reviewEvidence(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "evidence"] });
    },
    onError: handleApiError,
  });

  const unreviewMutation = useMutation({
    mutationFn: (id: number) => ticketKPIService.unreviewEvidence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "evidence"] });
    },
    onError: handleApiError,
  });

  const handleClientToggle = (clientId: number, checked: boolean) => {
    setSelectedClientIds((prev) =>
      checked ? [...prev, clientId] : prev.filter((id) => id !== clientId)
    );
  };

  return {
    evidence,
    isLoading,
    refetch,
    canReview,
    availableClients,
    isUploadOpen,
    setIsUploadOpen,
    selectedType,
    setSelectedType,
    description,
    setDescription,
    file,
    setFile,
    selectedClientIds,
    handleClientToggle,
    createMutation,
    deleteMutation,
    reviewMutation,
    unreviewMutation,
    resetForm,
  };
};
