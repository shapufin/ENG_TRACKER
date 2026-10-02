import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { HbprAssignmentDialog } from "./components/HbprAssignmentDialog";
import type { HbprAssignmentForm } from "./components/HbprAssignmentDialog";
import api from "@/lib/api";
import { hbprAssignmentService } from "@/services/hbprAssignmentService";
import { handleApiError } from "@/lib/error-handler";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS } from "@/types/hbprAssignment";
import type { HbprAssignment, HbprCadenceStatus, HbprPersonRef } from "@/types/hbprAssignment";
import type { PaginatedResponse } from "@/types";

const QUERY_KEY = ["admin", "hbpr-assignments"];

const STATUS_TONE: Record<HbprCadenceStatus, "success" | "warning" | "destructive" | "neutral"> = {
  on_track: "success",
  due: "warning",
  overdue: "destructive",
  not_started: "neutral",
  ended: "neutral",
};

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
    onError: (error) => toast.error(handleApiError(error)),
  });

  const endMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => hbprAssignmentService.end(id, date),
    onSuccess: () => {
      toast.success("Assignment ended");
      setEnding(null);
      invalidate();
    },
    onError: (error) => toast.error(handleApiError(error)),
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
      <GlassCard>
        {rows.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No assignments yet"
            description="Create an assignment to give an HBPR visibility of an Albanian team leader."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">HBPR assignments</caption>
              <thead>
                <tr className="border-border/60 text-muted-foreground border-b text-xs tracking-wide uppercase">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    HBPR
                  </th>
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    Albanian TL
                  </th>
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    Cadence
                  </th>
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    Next due
                  </th>
                  <th scope="col" className="py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/50 divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-4">{row.hbpr_detail.name}</td>
                    <td className="py-3 pr-4">{row.albanian_tl_detail.name}</td>
                    <td className="py-3 pr-4">{CADENCE_LABELS[row.cadence]}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={STATUS_TONE[row.cadence_status]}>
                        {CADENCE_STATUS_LABELS[row.cadence_status]}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums">{row.next_due_on ?? "—"}</td>
                    <td className="py-3 text-right">
                      {row.is_current && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEnding(row);
                            setEndDate(todayIso());
                          }}
                        >
                          End
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

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
        }? The history is kept for its governance evidence.`}
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
