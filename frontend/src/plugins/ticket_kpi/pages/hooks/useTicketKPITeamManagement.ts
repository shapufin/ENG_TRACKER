import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketKPIService } from "../../services/ticketKPIService";
import { toast } from "sonner";
import type { TicketImportBatch } from "../../types/ticketKPI";

export interface BatchRow extends TicketImportBatch {
  user_name?: string;
}

export const useTicketKPITeamManagement = (isTeamLeader: boolean) => {
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [batchToDelete, setBatchToDelete] = useState<TicketImportBatch | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ["ticket_kpi", "team_batches", selectedMonth || "all"],
    queryFn: () => ticketKPIService.getTeamBatches(selectedMonth || undefined),
    enabled: isTeamLeader,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ticketKPIService.deleteTeamBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_batches"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_summary"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "dashboard"] });
      toast.success("Upload deleted. The user can now re-upload.");
      setBatchToDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete upload.");
    },
  });

  const rows: BatchRow[] = useMemo(() => {
    if (!batches) return [];
    return batches.map((b) => ({ ...b, user_name: b.username || `User ${b.user}` }));
  }, [batches]);

  const stats = useMemo(() => {
    const totalRecords = rows.reduce((sum, b) => sum + (b.record_count || 0), 0);
    const uniqueUsers = new Set(rows.map((b) => b.user)).size;
    const uniqueMonths = new Set(rows.map((b) => b.month)).size;
    return { totalRecords, uniqueUsers, uniqueMonths };
  }, [rows]);

  return {
    selectedMonth,
    setSelectedMonth,
    batchToDelete,
    setBatchToDelete,
    rows,
    stats,
    isLoading,
    deleteMutation,
  };
};
