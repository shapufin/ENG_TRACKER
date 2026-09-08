/**
 * PayrollSettingsPage — view and edit payroll configuration and rule sets.
 */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollService } from "../services/payrollService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { PayrollConfiguration, ChoiceOption, PayrollRuleSet } from "../types";
import { PayrollRuleSetEditorDialog } from "../components/PayrollRuleSetEditorDialog";

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
      {/* Configuration */}
      <GlassCard className="mb-6 p-6">
        <h3 className="mb-4 text-lg font-semibold">Organization & Payroll Defaults</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="org">Organization Name</Label>
            <Input
              id="org"
              value={form.organization_name ?? ""}
              onChange={(e) => updateField("organization_name", e.target.value)}
              disabled={!canConfigurePayroll}
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={form.currency ?? "ALL"}
              onValueChange={(v) => updateField("currency", v)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {(choices?.currency ?? []).map((opt: ChoiceOption) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="country">Payroll country</Label>
            <Select
              value={form.country ?? "AL"}
              onValueChange={(value) => updateField("country", value)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="country">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {(choices?.country ?? [{ value: "AL", label: "Albania" }]).map(
                  (opt: ChoiceOption) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="weekday-standby-rate">Weekday Standby Rate (Lek/hour)</Label>
            <Input
              id="weekday-standby-rate"
              type="number"
              value={form.weekday_standby_hourly_rate ?? "0"}
              onChange={(e) => updateField("weekday_standby_hourly_rate", e.target.value)}
              disabled={!canConfigurePayroll}
            />
            {invalidWeekdayRate && (
              <p className="mt-1 text-xs text-destructive">Weekday rate cannot be negative.</p>
            )}
          </div>
          <div>
            <Label htmlFor="weekend-standby-rate">Weekend Standby Rate (Lek/hour)</Label>
            <Input
              id="weekend-standby-rate"
              type="number"
              value={form.weekend_standby_hourly_rate ?? "0"}
              onChange={(e) => updateField("weekend_standby_hourly_rate", e.target.value)}
              disabled={!canConfigurePayroll}
            />
            {invalidWeekendRate && (
              <p className="mt-1 text-xs text-destructive">Weekend rate cannot be negative.</p>
            )}
          </div>
          <div>
            <Label htmlFor="rounding">Rounding Mode</Label>
            <Select
              value={form.rounding_mode ?? "half_up"}
              onValueChange={(v) => updateField("rounding_mode", v)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="rounding">
                <SelectValue placeholder="Select rounding mode" />
              </SelectTrigger>
              <SelectContent>
                {(choices?.rounding_mode ?? []).map((opt: ChoiceOption) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              How final amounts are rounded to the configured precision.
            </p>
          </div>
          <div>
            <Label htmlFor="rounding-precision">Decimal Places for Rounding</Label>
            <Input
              id="rounding-precision"
              type="number"
              min={0}
              max={4}
              value={form.rounding_precision ?? 0}
              onChange={(e) => updateField("rounding_precision", e.target.value)}
              disabled={!canConfigurePayroll}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Decimal places for final amounts. 0 = whole Lek.
            </p>
          </div>
          <div>
            <Label htmlFor="hours-strategy">Monthly Working Hours Basis</Label>
            <Select
              value={form.monthly_hours_strategy ?? "fixed_174"}
              onValueChange={(v) => updateField("monthly_hours_strategy", v)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="hours-strategy">
                <SelectValue placeholder="Select hours strategy" />
              </SelectTrigger>
              <SelectContent>
                {(choices?.monthly_hours_strategy ?? []).map((opt: ChoiceOption) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Determines the base hourly rate: gross_wage / monthly_hours.
            </p>
          </div>
          <div>
            <Label htmlFor="fallback-cat">
              Default Overtime Category (when hours have no start/end time)
            </Label>
            <Select
              value={form.missing_timestamp_fallback_category ?? "weekday_day"}
              onValueChange={(v) => updateField("missing_timestamp_fallback_category", v)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="fallback-cat">
                <SelectValue placeholder="Select fallback category" />
              </SelectTrigger>
              <SelectContent>
                {(choices?.missing_timestamp_fallback_category ?? []).map((opt: ChoiceOption) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Category used when overtime has no start/end time.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
          <div>
            <Label htmlFor="default-tax-profile">Default Tax Profile</Label>
            <Select
              value={form.default_tax_profile ?? "standard"}
              onValueChange={(value) => updateField("default_tax_profile", value)}
              disabled={!canConfigurePayroll}
            >
              <SelectTrigger id="default-tax-profile">
                <SelectValue placeholder="Select tax profile" />
              </SelectTrigger>
              <SelectContent>
                {(
                  choices?.default_tax_profile ?? [
                    { value: "standard", label: "Standard employee" },
                    { value: "category_6", label: "Category 6" },
                    { value: "category_7", label: "Category 7" },
                  ]
                ).map((opt: ChoiceOption) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Used when an employee has no separate tax profile.
            </p>
          </div>
          <div>
            <Label htmlFor="default-workday-hours">Standard Workday Hours</Label>
            <Input
              id="default-workday-hours"
              type="number"
              min="0"
              step="0.25"
              value={form.default_workday_hours ?? "8"}
              onChange={(e) => updateField("default_workday_hours", e.target.value)}
              disabled={!canConfigurePayroll}
            />
          </div>
          <div>
            <Label htmlFor="rules-source-label">Source Reference Label</Label>
            <Input
              id="rules-source-label"
              value={form.rules_source_label ?? ""}
              onChange={(e) => updateField("rules_source_label", e.target.value)}
              disabled={!canConfigurePayroll}
              placeholder="Example: Official guidance 2026"
            />
          </div>
          <div>
            <Label htmlFor="rules-validation-status">Validation Status</Label>
            <Input
              id="rules-validation-status"
              value={form.rules_validation_status ?? ""}
              onChange={(e) => updateField("rules_validation_status", e.target.value)}
              disabled={!canConfigurePayroll}
              placeholder="reference, verified, or official"
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(
            [
              ["overtime_is_taxable", "Overtime is subject to income tax"],
              ["standby_is_taxable", "Standby is subject to income tax"],
              [
                "overtime_is_contribution_bearing",
                "Overtime is subject to social/health contributions",
              ],
              [
                "standby_is_contribution_bearing",
                "Standby is subject to social/health contributions",
              ],
              ["only_approved_entries", "Only include approved records in payroll"],
              [
                "require_tl_closed_before_finalize",
                "Require team-leader approval before finalizing payroll",
              ],
            ] as const
          ).map(([key, label]) => (
            <SwitchField
              key={key}
              id={`payroll-${key}`}
              label={label}
              description="Applied when payroll calculations are generated."
              checked={Boolean(form[key])}
              onCheckedChange={(checked) => setOverrides((prev) => ({ ...prev, [key]: checked }))}
              disabled={!canConfigurePayroll}
            />
          ))}
        </div>
        <div className="mt-4">
          <Label htmlFor="footer">Payslip Footer</Label>
          <Input
            id="footer"
            value={form.payslip_footer ?? ""}
            onChange={(e) => updateField("payslip_footer", e.target.value)}
            disabled={!canConfigurePayroll}
          />
        </div>
      </GlassCard>

      {/* Rule sets */}
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Payroll Calculations</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Status is based on today. Payroll runs use the rule set effective on the first day of
              the selected month.
            </p>
          </div>
          {supersededCount > 0 && (
            <SwitchField
              id="show-superseded"
              label={`Show superseded (${supersededCount})`}
              description="Include rule sets replaced by a newer version."
              checked={showSuperseded}
              onCheckedChange={setShowSuperseded}
              className="max-w-sm"
            />
          )}
        </div>
        {visibleRuleSets.length > 0 ? (
          <div className="space-y-3">
            {visibleRuleSets.map((rs) => (
              <div key={rs.id} className="rounded-lg border border-border/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{rs.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      v{rs.version} · {rs.code}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        {
                          current: "border-success/30 bg-success/10 text-foreground",
                          upcoming: "border-primary/30 bg-primary/10 text-foreground",
                          superseded: "border-warning/30 bg-warning/10 text-foreground",
                          inactive: "border-border bg-muted text-foreground",
                        }[rs.effective_status]
                      }
                      title={
                        {
                          current:
                            "This is the rule set effective today. A payroll run uses the rule set effective on the first day of its selected month.",
                          upcoming: "This rule set becomes effective on its effective-from date.",
                          superseded:
                            "Another active rule set with a later effective date covers today, so this one is no longer used for new payroll runs.",
                          inactive: "This rule set is marked inactive and is never used.",
                        }[rs.effective_status]
                      }
                    >
                      {rs.effective_status === "current"
                        ? "Current today"
                        : rs.effective_status === "upcoming"
                          ? "Upcoming"
                          : rs.effective_status === "superseded"
                            ? "Superseded"
                            : "Inactive"}
                    </Badge>
                    <Badge variant="outline">{rs.validation_status}</Badge>
                    {rs.has_payroll_runs && (
                      <span className="text-xs text-muted-foreground">
                        Locked — used in payroll runs
                      </span>
                    )}
                    {canConfigurePayroll && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rs.has_payroll_runs}
                          title={
                            rs.has_payroll_runs
                              ? "This calculation is locked because it has been used in payroll runs. Create an updated version instead."
                              : "Edit this calculation before it is used in payroll."
                          }
                          onClick={() => {
                            setRuleSetMode("edit");
                            setEditingRuleSet(rs);
                          }}
                        >
                          Edit calculation
                        </Button>
                        <Button
                          size="sm"
                          variant={rs.has_payroll_runs ? "default" : "outline"}
                          onClick={() => {
                            setRuleSetMode("version");
                            setEditingRuleSet(rs);
                          }}
                        >
                          Create updated version
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {rs.has_payroll_runs && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    This calculation is locked to protect historical payroll results. Create an
                    updated version for future payroll periods.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Effective:</span> {rs.effective_from} →{" "}
                    {rs.effective_to ?? "ongoing"}
                  </div>
                  <div>
                    <span className="font-medium">Tax brackets:</span>{" "}
                    {rs.tax_brackets?.length ?? 0}
                  </div>
                  <div>
                    <span className="font-medium">Contributions:</span>{" "}
                    {rs.contribution_rates?.length ?? 0}
                  </div>
                </div>
                {rs.source && (
                  <p className="mt-2 text-xs text-muted-foreground">Source: {rs.source}</p>
                )}
                {rs.notes && <p className="mt-1 text-xs text-muted-foreground">{rs.notes}</p>}
              </div>
            ))}
          </div>
        ) : ruleSets && ruleSets.length > 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            All calculations are superseded.{" "}
            {supersededCount > 0 && "Enable “Show superseded” above to view them."}
          </p>
        ) : (
          <p className="py-4 text-center text-muted-foreground">
            No payroll calculations are configured yet. Contact an administrator to set up the first
            calculation.
          </p>
        )}
      </GlassCard>

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
