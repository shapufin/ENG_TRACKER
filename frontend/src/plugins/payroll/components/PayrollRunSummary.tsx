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

export const PayrollRunSummary: React.FC<PayrollRunSummaryProps> = ({ totals }) => (
  <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
    <GlassCard className="p-4" glow="primary">
      <p className="text-sm text-muted-foreground">Total Gross</p>
      <p className="text-2xl font-bold">{Number(totals.total_gross ?? 0).toLocaleString()}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="destructive">
      <p className="text-sm text-muted-foreground">Total Deductions</p>
      <p className="text-2xl font-bold">{Number(totals.total_deductions ?? 0).toLocaleString()}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="success">
      <p className="text-sm text-muted-foreground">Total Net Pay</p>
      <p className="text-2xl font-bold">{Number(totals.total_net ?? 0).toLocaleString()}</p>
    </GlassCard>
    <GlassCard className="p-4" glow="warning">
      <p className="text-sm text-muted-foreground">Employer Cost</p>
      <p className="text-2xl font-bold">
        {Number(totals.total_employer_cost ?? 0).toLocaleString()}
      </p>
    </GlassCard>
  </div>
);
