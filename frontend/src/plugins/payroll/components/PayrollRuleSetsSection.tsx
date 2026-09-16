/**
 * PayrollRuleSetsSection — the "Payroll Calculations" card on
 * PayrollSettingsPage: superseded-visibility toggle + rule set list/empty
 * states. Extracted from PayrollSettingsPage alongside PayrollRuleSetCard.
 */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { PayrollRuleSetCard } from "./PayrollRuleSetCard";
import type { PayrollRuleSet } from "../types";

interface PayrollRuleSetsSectionProps {
  ruleSets: PayrollRuleSet[] | undefined;
  visibleRuleSets: PayrollRuleSet[];
  supersededCount: number;
  showSuperseded: boolean;
  onShowSupersededChange: (value: boolean) => void;
  canConfigurePayroll: boolean;
  onEdit: (ruleSet: PayrollRuleSet) => void;
  onCreateVersion: (ruleSet: PayrollRuleSet) => void;
}

export const PayrollRuleSetsSection: React.FC<PayrollRuleSetsSectionProps> = ({
  ruleSets,
  visibleRuleSets,
  supersededCount,
  showSuperseded,
  onShowSupersededChange,
  canConfigurePayroll,
  onEdit,
  onCreateVersion,
}) => (
  <GlassCard className="p-6">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">Payroll Calculations</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Status is based on today. Payroll runs use the rule set effective on the first day of the
          selected month.
        </p>
      </div>
      {supersededCount > 0 && (
        <SwitchField
          id="show-superseded"
          label={`Show superseded (${supersededCount})`}
          description="Include rule sets replaced by a newer version."
          checked={showSuperseded}
          onCheckedChange={onShowSupersededChange}
          className="max-w-sm"
        />
      )}
    </div>
    {visibleRuleSets.length > 0 ? (
      <div className="space-y-3">
        {visibleRuleSets.map((rs) => (
          <PayrollRuleSetCard
            key={rs.id}
            ruleSet={rs}
            canConfigurePayroll={canConfigurePayroll}
            onEdit={() => onEdit(rs)}
            onCreateVersion={() => onCreateVersion(rs)}
          />
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
);
