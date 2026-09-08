import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { UploadForm } from "../components/UploadForm";
import { UploadPreviewPanel } from "../components/UploadPreviewPanel";
import { ticketKPIService } from "../services/ticketKPIService";
import { overtimeService } from "@/services/overtimeService";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { UploadPreview } from "../types/ticketKPI";
import type { Client } from "@/types";

export const TicketUploadPage: React.FC = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [month, setMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["ticket_kpi", "profiles"],
    queryFn: () => ticketKPIService.getProfiles(),
  });

  const { data: allClients } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
  });

  // Filter clients to those assigned to the current user (defense-in-depth;
  // backend also scopes ClientViewSet to user.profile.clients for non-admins).
  // Admin/staff have no client_ids restriction so they can tag uploads for
  // any client.
  const clients = useMemo<Client[]>(() => {
    const userClientIds = user?.client_ids;
    if (!userClientIds || userClientIds.length === 0) return allClients ?? [];
    const allowed = new Set(userClientIds);
    return (allClients ?? []).filter((c) => allowed.has(c.id));
  }, [allClients, user?.client_ids]);

  const handleFileAccepted = (f: File) => {
    setFile(f);
    setPreview(null);
  };

  const handleClientToggle = (clientId: number, checked: boolean) => {
    setSelectedClientIds((prev) =>
      checked ? [...prev, clientId] : prev.filter((id) => id !== clientId)
    );
  };

  // fallow-ignore-next-line complexity
  const handleAnalyze = async () => {
    if (!file || !month) return;
    setIsAnalyzing(true);
    try {
      const { data } = await ticketKPIService.analyzeFile(file);
      toast.success(`Analyzed ${data.total_rows} rows`);

      const profileId = selectedProfileId ?? data.suggested_profile?.id ?? null;
      if (!profileId) {
        toast.error("No matching profile found. Please select one below.");
        setIsAnalyzing(false);
        return;
      }
      setSelectedProfileId(profileId);

      const monthDate = `${month}-01`;
      const previewRes = await ticketKPIService.previewUpload(file, profileId, monthDate);
      setPreview(previewRes.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Analyze failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // fallow-ignore-next-line complexity
  const handleImport = async (override: boolean) => {
    if (!file || !month || !selectedProfileId) return;
    setIsImporting(true);
    try {
      const monthDate = `${month}-01`;
      const { data } = await ticketKPIService.commitUpload(
        file,
        selectedProfileId,
        monthDate,
        override,
        selectedClientIds
      );
      toast.success(`Imported ${data.record_count} tickets for ${data.month}`);
      setFile(null);
      setPreview(null);
      setSelectedProfileId(null);
      setMonth("");
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "my_batches"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_summary"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_batches"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "monthly_summary"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "trend"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "categories"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error(err.response?.data?.error || "Only administrators can override uploads.");
      } else if (err.response?.status === 409) {
        toast.error("Upload exists. Only administrators can override.");
      } else {
        toast.error(err.response?.data?.error || "Import failed");
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <PageShell title="Ticket Upload" subtitle="Upload your monthly ticket export file.">
      <div className="mx-auto max-w-4xl space-y-6">
        <UploadForm
          month={month}
          onMonthChange={setMonth}
          file={file}
          onFileAccepted={handleFileAccepted}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          selectedProfileId={selectedProfileId}
          onProfileChange={setSelectedProfileId}
          selectedClientIds={selectedClientIds}
          onClientToggle={handleClientToggle}
          profiles={profiles}
          clients={clients}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />

        {preview && (
          <UploadPreviewPanel preview={preview} onImport={handleImport} isImporting={isImporting} />
        )}
      </div>
    </PageShell>
  );
};
