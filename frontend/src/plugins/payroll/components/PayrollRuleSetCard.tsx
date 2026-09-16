/**
 * PayrollRuleSetCard — one rule set row inside PayrollRuleSetsSection.
 * Extracted from PayrollSettingsPage; the effective-status tone/title/label
 * lookups replace what were three inline ternary chains.
 */
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PayrollRuleSet } from "../types";

const STATUS_TONE_CLASS: Record<PayrollRuleSet["effective_status"], string> = {
  current: "border-success/30 bg-success/10 text-foreground",
  upcoming: "border-primary/30 bg-primary/10 text-foreground",
  superseded: "border-warning/30 bg-warning/10 text-foreground",
  inactive: "border-border bg-muted text-foreground",
};

const STATUS_TITLE: Record<PayrollRuleSet["effective_status"], string> = {
  current:
    "This is the rule set effective today. A payroll run uses the rule set effective on the first day of its selected month.",
  upcoming: "This rule set becomes effective on its effective-from date.",
  superseded:
    "Another active rule set with a later effective date covers today, so this one is no longer used for new payroll runs.",
  inactive: "This rule set is marked inactive and is never used.",
};

const STATUS_LABEL: Record<PayrollRuleSet["effective_status"], string> = {
  current: "Current today",
  upcoming: "Upcoming",
  superseded: "Superseded",
  inactive: "Inactive",
};

interface PayrollRuleSetCardProps {
  ruleSet: PayrollRuleSet;
  canConfigurePayroll: boolean;
  onEdit: () => void;
  onCreateVersion: () => void;
}

export const PayrollRuleSetCard: React.FC<PayrollRuleSetCardProps> = ({
  ruleSet: rs,
  canConfigurePayroll,
  onEdit,
  onCreateVersion,
}) => (
  <div className="rounded-lg border border-border/50 p-4">
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
          className={STATUS_TONE_CLASS[rs.effective_status]}
          title={STATUS_TITLE[rs.effective_status]}
        >
          {STATUS_LABEL[rs.effective_status]}
        </Badge>
        <Badge variant="outline">{rs.validation_status}</Badge>
        {rs.has_payroll_runs && (
          <span className="text-xs text-muted-foreground">Locked — used in payroll runs</span>
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
              onClick={onEdit}
            >
              Edit calculation
            </Button>
            <Button
              size="sm"
              variant={rs.has_payroll_runs ? "default" : "outline"}
              onClick={onCreateVersion}
            >
              Create updated version
            </Button>
          </div>
        )}
      </div>
    </div>
    {rs.has_payroll_runs && (
      <p className="mb-3 text-xs text-muted-foreground">
        This calculation is locked to protect historical payroll results. Create an updated version
        for future payroll periods.
      </p>
    )}
    <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
      <div>
        <span className="font-medium">Effective:</span> {rs.effective_from} →{" "}
        {rs.effective_to ?? "ongoing"}
      </div>
      <div>
        <span className="font-medium">Tax brackets:</span> {rs.tax_brackets?.length ?? 0}
      </div>
      <div>
        <span className="font-medium">Contributions:</span> {rs.contribution_rates?.length ?? 0}
      </div>
    </div>
    {rs.source && <p className="mt-2 text-xs text-muted-foreground">Source: {rs.source}</p>}
    {rs.notes && <p className="mt-1 text-xs text-muted-foreground">{rs.notes}</p>}
  </div>
);
