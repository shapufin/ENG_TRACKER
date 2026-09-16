/**
 * PayrollSettingsPage — view and edit payroll configuration and rule sets.
 */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { PayrollConfiguration, PayrollRuleSet } from "../types";
import { PayrollRuleSetEditorDialog } from "../components/PayrollRuleSetEditorDialog";
import { PayrollConfigurationForm } from "../components/PayrollConfigurationForm";
import { PayrollRuleSetsSection } from "../components/PayrollRuleSetsSection";

export const PayrollSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { canConfigure } = usePluginPermissions();
  const canConfigurePayroll = canConfigure("payroll");
  const [overrides, setOverrides] = useState<Partial<PayrollConfiguration>>({});
  const [editingRuleSet, setEditingRuleSet] = useState<PayrollRuleSet | null>(null);
  const [ruleSetMode, setRuleSetMode] = useState<"edit" | "version">("edit");
  const [showSuperseded, setShowSuperseded] = useState(false);

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["payroll-configuration"],
    queryFn: () => payrollService.getConfiguration(),
  });

  const { data: ruleSets } = useQuery({
    queryKey: ["payroll-rule-sets", { active: undefined }],
    queryFn: () => payrollService.getRuleSets(),
  });

  const { data: choices } = useQuery({
    queryKey: ["payroll-configuration-choices"],
    queryFn: () => payrollService.getConfigurationChoices(),
  });

  // Merge server config with local overrides — no useEffect needed.
  const form = useMemo<Partial<PayrollConfiguration>>(
    () => ({ ...config, ...overrides }),
    [config, overrides]
  );

  const updateField = (key: keyof PayrollConfiguration, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const updateSwitch = (key: keyof PayrollConfiguration, checked: boolean) => {
    setOverrides((prev) => ({ ...prev, [key]: checked }));
  };

  // Hide superseded rule sets by default — they're replaced by a newer
  // active version and only clutter the list. Toggling "Show superseded"
  // reveals them. If the newer version is deleted, the old one's
  // effective_status flips back to "current" server-side and it reappears
  // automatically (no special un-hide logic needed).
  const visibleRuleSets = useMemo(() => {
    if (!ruleSets) return [];
    if (showSuperseded) return ruleSets;
    return ruleSets.filter((rs) => rs.effective_status !== "superseded");
  }, [ruleSets, showSuperseded]);

  const supersededCount = useMemo(
    () => ruleSets?.filter((rs) => rs.effective_status === "superseded").length ?? 0,
    [ruleSets]
  );

  const invalidWeekdayRate =
    form.weekday_standby_hourly_rate !== undefined &&
    form.weekday_standby_hourly_rate !== "" &&
    Number(form.weekday_standby_hourly_rate) < 0;

  const invalidWeekendRate =
    form.weekend_standby_hourly_rate !== undefined &&
    form.weekend_standby_hourly_rate !== "" &&
    Number(form.weekend_standby_hourly_rate) < 0;

  const saveMutation = useMutation({
    mutationFn: () => payrollService.updateConfiguration(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-configuration"] });
      setOverrides({});
      toast.success("Payroll settings saved");
    },
    onError: (error) => handleApiError(error),
  });

  const openEditRuleSet = (rs: PayrollRuleSet) => {
    setRuleSetMode("edit");
    setEditingRuleSet(rs);
  };

  const openCreateVersion = (rs: PayrollRuleSet) => {
    setRuleSetMode("version");
    setEditingRuleSet(rs);
  };

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (error || !config) return <ErrorCard title="Failed to load configuration" onRetry={refetch} />;

  return (
    <PageShell
      title="Payroll Settings"
      subtitle="Configuration, rule sets, and validation status"
      actions={
        canConfigurePayroll ? (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || invalidWeekdayRate || invalidWeekendRate}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        ) : undefined
      }
    >
      <PayrollConfigurationForm
        form={form}
        choices={choices}
        canConfigurePayroll={canConfigurePayroll}
        invalidWeekdayRate={invalidWeekdayRate}
        invalidWeekendRate={invalidWeekendRate}
        onFieldChange={updateField}
        onSwitchChange={updateSwitch}
      />

      <PayrollRuleSetsSection
        ruleSets={ruleSets}
        visibleRuleSets={visibleRuleSets}
        supersededCount={supersededCount}
        showSuperseded={showSuperseded}
        onShowSupersededChange={setShowSuperseded}
        canConfigurePayroll={canConfigurePayroll}
        onEdit={openEditRuleSet}
        onCreateVersion={openCreateVersion}
      />

      <PayrollRuleSetEditorDialog
        key={`${editingRuleSet?.id ?? "new"}-${ruleSetMode}-${editingRuleSet?.updated_at ?? "new"}`}
        open={editingRuleSet !== null}
        onOpenChange={(open) => !open && setEditingRuleSet(null)}
        source={editingRuleSet}
        mode={ruleSetMode}
        onSaved={() => {
          setEditingRuleSet(null);
          queryClient.invalidateQueries({ queryKey: ["payroll-rule-sets"] });
          toast.success(
            ruleSetMode === "edit"
              ? "Payroll calculation updated"
              : "New payroll calculation version created"
          );
        }}
      />
    </PageShell>
  );
};
