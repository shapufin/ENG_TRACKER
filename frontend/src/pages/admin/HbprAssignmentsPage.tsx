import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { HbprAssignmentDialog } from "./components/HbprAssignmentDialog";
import type { HbprAssignmentForm } from "./components/HbprAssignmentDialog";
import { useHbprAssignmentColumns } from "./hooks/useHbprAssignmentColumns";
import api from "@/lib/api";
import { hbprAssignmentService } from "@/services/hbprAssignmentService";
import { handleApiError } from "@/lib/error-handler";
import type { HbprAssignment, HbprPersonRef } from "@/types/hbprAssignment";
import type { PaginatedResponse } from "@/types";

const QUERY_KEY = ["admin", "hbpr-assignments"];

// Local calendar date (en-CA formats as YYYY-MM-DD); `toISOString()` is UTC and
// is a day off for an admin working just after local midnight.
const todayIso = () => new Date().toLocaleDateString("en-CA");

const emptyForm = (): HbprAssignmentForm => ({
  hbpr: null,
  albanian_tl: null,
  cadence: "weekly",
  effective_from: todayIso(),
});

/**
 * Admin management for explicit HBPR ↔ Albanian TL assignments.
 *
 * Identity and range are immutable once created — the API rejects PATCH on
 * them — so this page creates and ends assignments; it never edits in place.
 */
export const HbprAssignmentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<HbprAssignmentForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [ending, setEnding] = useState<HbprAssignment | null>(null);
  const [endDate, setEndDate] = useState(todayIso());

  const assignmentsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await hbprAssignmentService.list();
      return Array.isArray(data) ? data : (data as PaginatedResponse<HbprAssignment>).results;
    },
  });

  // Candidate pickers: every active user, filtered client-side by role. The
  // page is admin-only, so the full user list is already reachable.
  const usersQuery = useQuery({
    queryKey: ["admin", "hbpr-assignable-users"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Record<string, unknown>>>("/users/users/", {
        params: { page_size: 500 },
      });
      return data.results ?? [];
    },
  });

  const toRef = (row: Record<string, unknown>): HbprPersonRef => ({
    id: row.id as number,
    name:
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || (row.username as string),
  });

  const hbprOptions = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((u) => Array.isArray(u.roles) && (u.roles as string[]).includes("hbpr"))
        .map(toRef),
    [usersQuery.data]
  );
  const albanianTlOptions = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((u) => Array.isArray(u.roles) && (u.roles as string[]).includes("albanian_tl"))
        .map(toRef),
    [usersQuery.data]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: hbprAssignmentService.create,
    onSuccess: () => {
      toast.success("Assignment created");
      setDialogOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: handleApiError,
  });

  const endMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => hbprAssignmentService.end(id, date),
    onSuccess: () => {
      toast.success("Assignment ended");
      setEnding(null);
      invalidate();
    },
    onError: handleApiError,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.hbpr) errors.hbpr = "Select an HR Business Partner.";
    if (!form.albanian_tl) errors.albanian_tl = "Select an Albanian team leader.";
    if (!form.effective_from) errors.effective_from = "A start date is required.";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    createMutation.mutate({
      hbpr: form.hbpr as number,
      albanian_tl: form.albanian_tl as number,
      cadence: form.cadence,
      effective_from: form.effective_from,
    });
  };

  const handleEnd = useCallback((row: HbprAssignment) => {
    setEnding(row);
    setEndDate(todayIso());
  }, []);
  const columns = useHbprAssignmentColumns(handleEnd);

  if (assignmentsQuery.isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (assignmentsQuery.isError) {
    return (
      <ErrorCard title="Failed to load assignments" onRetry={() => assignmentsQuery.refetch()} />
    );
  }

  const rows = assignmentsQuery.data ?? [];

  return (
    <PageShell
      title="HBPR assignments"
      subtitle="Pair HR Business Partners with the Albanian team leaders they support."
      actions={
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New assignment
        </Button>
      }
    >
      {rows.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={Handshake}
            title="No assignments yet"
            description="Create an assignment to give an HBPR visibility of an Albanian team leader."
          />
        </GlassCard>
      ) : (
        <GlassCard delay={0} className="p-4">
          <DataTable
            columns={columns}
            data={rows}
            searchColumn={["hbpr_detail.name", "albanian_tl_detail.name"]}
            searchPlaceholder="Search assignments..."
            getRowId={(row) => String(row.id)}
            emptyMessage="No assignments match your search."
          />
        </GlassCard>
      )}

      <HbprAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hbprOptions={hbprOptions}
        albanianTlOptions={albanianTlOptions}
        form={form}
        formErrors={formErrors}
        onFieldChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
      />

      <ConfirmDialog
        open={!!ending}
        onOpenChange={() => setEnding(null)}
        title="End assignment"
        description={`End the assignment between ${ending?.hbpr_detail.name ?? ""} and ${
          ending?.albanian_tl_detail.name ?? ""
        }? The end date is the last day of access; the history is kept for its governance evidence.`}
        onConfirm={() => ending && endMutation.mutate({ id: ending.id, date: endDate })}
      >
        <FormField
          id="hbpr-assignment-end-date"
          label="End date"
          value={endDate}
          onChange={setEndDate}
          type="date"
          required
        />
      </ConfirmDialog>
    </PageShell>
  );
};
