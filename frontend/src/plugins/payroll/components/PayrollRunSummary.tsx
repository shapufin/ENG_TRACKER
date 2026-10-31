/**
 * PayrollRunSummary — summary cards for a single payroll run.
 */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";

interface PayrollRunSummaryProps {
  totals: {
    total_gross?: string | number;
    total_deductions?: string | number;
    total_net?: string | number;
    total_employer_cost?: string | number;
  };
}

export const PayrollRunSummary: React.FC<PayrollRunSummaryProps> = ({ totals }) => {
  const lek = (value: string | number | undefined) =>
    `${Number(value ?? 0).toLocaleString()} Lek`;
  return (
  <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
    <GlassCard className="p-4" glow="primary">
      <p className="text-sm text-muted-foreground">Total Gross</p>
      <p className="text-2xl font-bold">{lek(totals.total_gross)}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="destructive">
      <p className="text-sm text-muted-foreground">Total Deductions</p>
      <p className="text-2xl font-bold">{lek(totals.total_deductions)}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="success">
      <p className="text-sm text-muted-foreground">Total Net Pay</p>
      <p className="text-2xl font-bold">{lek(totals.total_net)}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="warning">
      <p className="text-sm text-muted-foreground">Employer Cost</p>
      <p className="text-2xl font-bold">{lek(totals.total_employer_cost)}</p>
    </GlassCard>
  </div>
  );
};
