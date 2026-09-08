import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketKPIService } from "../../services/ticketKPIService";
import { overtimeService } from "@/services/overtimeService";
import { toast } from "sonner";
import type { ExportProfile, UploadPreview } from "../../types/ticketKPI";

export const useTicketKPIAdmin = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("profiles");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ExportProfile | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testProfileId, setTestProfileId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<UploadPreview | null>(null);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const { data: profiles } = useQuery({
    queryKey: ["ticket_kpi", "profiles"],
    queryFn: () => ticketKPIService.getProfiles(),
  });

  const { data: clients } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<ExportProfile>) => ticketKPIService.createProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "profiles"] });
      setDialogOpen(false);
      toast.success("Profile created");
    },
    onError: () => toast.error("Failed to create profile"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ExportProfile> }) =>
      ticketKPIService.updateProfile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "profiles"] });
      setDialogOpen(false);
      toast.success("Profile updated");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ticketKPIService.deleteProfile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "profiles"] });
      toast.success("Profile deleted");
    },
    onError: () => toast.error("Failed to delete profile"),
  });

  const openCreateDialog = () => {
    setEditingProfile(null);
    setDialogOpen(true);
  };

  const openEditDialog = (profile: ExportProfile) => {
    setEditingProfile(profile);
    setDialogOpen(true);
  };

  const handleSave = (payload: Partial<ExportProfile>) => {
    if (editingProfile) updateMutation.mutate({ id: editingProfile.id, data: payload });
    else createMutation.mutate(payload);
  };

  const handleTestMapping = async () => {
    if (!testFile || !testProfileId) return;
    try {
      const { data } = await ticketKPIService.testMapping(testProfileId, testFile);
      setTestResult(data);
      toast.success(`Tested ${data.total_records} records`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Test failed";
      toast.error(message);
    }
  };

  return {
    activeTab,
    setActiveTab,
    dialogOpen,
    setDialogOpen,
    editingProfile,
    profiles,
    clients,
    testFile,
    setTestFile,
    testProfileId,
    setTestProfileId,
    testResult,
    setTestResult,
    reportYear,
    setReportYear,
    createMutation,
    updateMutation,
    deleteMutation,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleTestMapping,
  };
};
