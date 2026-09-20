import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HolidayTable } from "../admin/components/HolidayTable";
import { HolidayFormDialog } from "../admin/components/HolidayFormDialog";
import { useHRHolidays } from "./hooks/useHRHolidays";

/**
 * HR-native Company Holidays page (Part D: HR reaches holiday management
 * without routing through the admin panel). Reuses the admin page's own
 * Holiday components; Team Calendar Groups / Workspaces stay admin-only
 * (their bulk cross-team actions are not granted to HR).
 */
export const HRCalendarsPage: React.FC = () => {
  const {
    workspaceOptions,
    holidayRows,
    holidaysLoading,
    formOpen,
    setFormOpen,
    editingHoliday,
    holidayForm,
    setHolidayForm,
    deleteTarget,
    setDeleteTarget,
    holidayMutation,
    deleteHolidayMutation,
    openHolidayForm,
    handleHolidaySubmit,
  } = useHRHolidays();

  return (
    <PageShell title="Company Holidays" subtitle="Manage global and workspace holidays.">
      <GlassCard isHoverLift={false} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Holiday Catalog
            </p>
            <h3 className="text-lg font-semibold">Global & Workspace Holidays</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openHolidayForm()}>
              <CalendarDays className="mr-2 h-4 w-4" /> Add Holiday
            </Button>
          </div>
        </div>
      </GlassCard>

      <HolidayTable
        holidays={holidayRows}
        isLoading={holidaysLoading}
        onEdit={openHolidayForm}
        onDelete={setDeleteTarget}
      />

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingName={editingHoliday?.name}
        form={holidayForm}
        onFormChange={setHolidayForm}
        workspaceOptions={workspaceOptions}
        isSubmitting={holidayMutation.isPending}
        onSubmit={handleHolidaySubmit}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Holiday"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"?`}
        onConfirm={() => deleteTarget && deleteHolidayMutation.mutate(deleteTarget.id)}
        isConfirming={deleteHolidayMutation.isPending}
        variant="destructive"
      />
    </PageShell>
  );
};

export default HRCalendarsPage;
