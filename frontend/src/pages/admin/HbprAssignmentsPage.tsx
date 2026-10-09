import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { invalidateAdminDashboard } from "@/lib/adminDashboardKeys";

const QUERY_KEY = ["admin", "hbpr-assignments"];

// Module constant: an inline array would be a fresh identity every render and
// defeat DataTable's searchPaths memo.
const SEARCH_PATHS = ["hbpr_detail.name", "albanian_tl_detail.name"];

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
  const [tab, setTab] = useState<"active" | "archive">("active");

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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    void invalidateAdminDashboard(queryClient);
  };

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

  const rows = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  // Active = still in effect or scheduled (no end date, or an end date that has
  // not passed — matches the backend's `?current=`/`unfinished_q` semantics).
  // Archive = ended. `is_current` is the same split the backend makes.
  const { activeRows, archivedRows } = useMemo(
    () => ({
      activeRows: rows.filter((row) => row.is_current),
      archivedRows: rows.filter((row) => !row.is_current),
    }),
    [rows]
  );

  if (assignmentsQuery.isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (assignmentsQuery.isError) {
    return (
      <ErrorCard title="Failed to load assignments" onRetry={() => assignmentsQuery.refetch()} />
    );
  }

  const table = (data: HbprAssignment[], emptyMessage: string) => (
    <GlassCard delay={0} className="p-4">
      <DataTable
        columns={columns}
        data={data}
        searchColumn={SEARCH_PATHS}
        searchPlaceholder="Search assignments..."
        getRowId={(row) => String(row.id)}
        emptyMessage={emptyMessage}
      />
    </GlassCard>
  );

  return (
    <PageShell
      title="HBPR assignments"
      subtitle="Pair HR Business Partners with the Albanian team leaders they support."
      actions={
        <Button size="sm" onClick={() => setDialogOpen(true)}>
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
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList aria-label="Assignment groups">
            <TabsTrigger value="active">Active ({activeRows.length})</TabsTrigger>
            <TabsTrigger value="archive">Archive ({archivedRows.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {table(activeRows, "No active assignments.")}
          </TabsContent>
          <TabsContent value="archive" className="mt-4">
            <p className="text-muted-foreground mb-3 px-1 text-sm">
              Ended relationships are retained for their partnership log. Entries older than 6
              months are removed automatically unless log entries reference them.
            </p>
            {table(archivedRows, "No ended assignments.")}
          </TabsContent>
        </Tabs>
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
        }? The end date is the last day of access; the history is kept for its partnership log.`}
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
