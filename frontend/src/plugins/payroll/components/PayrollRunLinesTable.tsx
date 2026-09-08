/**
 * PayrollRunLinesTable — employee breakdown table with payslip download
 * and per-user regenerate (draft runs only).
 */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PayrollLine } from "../types";

interface PayrollRunLinesTableProps {
  lines: PayrollLine[] | undefined;
  isLoading: boolean;
  isDraft: boolean;
  canExport: boolean;
  canManage: boolean;
  onPayslipDownload: (lineId: number) => void;
  payslipLoading: boolean;
  payslipLoadingId?: number | null;
  onGenerateLine: (userId: number) => void;
  generateLineLoading: boolean;
  generatingUserId?: number | null;
}

export const PayrollRunLinesTable: React.FC<PayrollRunLinesTableProps> = ({
  lines,
  isLoading,
  isDraft,
  canExport,
  canManage,
  onPayslipDownload,
  payslipLoading,
  payslipLoadingId,
  onGenerateLine,
  generateLineLoading,
  generatingUserId,
}) => (
  <GlassCard className="p-6">
    <h3 className="mb-4 text-lg font-semibold">Employee Breakdown</h3>
    {isLoading ? (
      <p className="text-muted-foreground">Loading...</p>
    ) : lines && lines.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">Employee</th>
              <th className="pb-2 pr-4 text-right">Gross</th>
              <th className="pb-2 pr-4 text-right">Overtime</th>
              <th className="pb-2 pr-4 text-right">Standby</th>
              <th className="pb-2 pr-4 text-right">Social</th>
              <th className="pb-2 pr-4 text-right">Health</th>
              <th className="pb-2 pr-4 text-right">Tax</th>
              <th className="pb-2 pr-4 text-right">Net Pay</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line: PayrollLine) => (
              <tr key={line.id} className="border-b border-border/50">
                <td className="py-2 pr-4">{line.user_full_name}</td>
                <td className="py-2 pr-4 text-right">
                  {Number(line.gross_monthly_wage).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right">
                  <div>
                    {Number(line.overtime_hours) > 0 ? `${Number(line.overtime_hours)}h` : "—"}
                  </div>
                  {(line.carryover_breakdown?.carried_over?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Carryover
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  {Number(line.standby_hours) > 0 ? `${Number(line.standby_hours)}h` : "—"}
                </td>
                <td className="py-2 pr-4 text-right">
                  {Number(line.employee_social).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right">
                  {Number(line.employee_health).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right">{Number(line.income_tax).toLocaleString()}</td>
                <td className="py-2 pr-4 text-right font-semibold">
                  {Number(line.net_pay).toLocaleString()}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    {isDraft && canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Recalculate this employee's payroll"
                        onClick={() => onGenerateLine(line.user)}
                        disabled={generateLineLoading && generatingUserId === line.user}
                      >
                        {generateLineLoading && generatingUserId === line.user ? "..." : "Generate"}
                      </Button>
                    )}
                    {canExport && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Download individual payslip PDF"
                        onClick={() => onPayslipDownload(line.id)}
                        disabled={payslipLoading && payslipLoadingId === line.id}
                      >
                        {payslipLoading && payslipLoadingId === line.id ? "..." : "PDF"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="py-4 text-center text-muted-foreground">
        No payroll lines. {isDraft && "Click Regenerate to calculate."}
      </p>
    )}
  </GlassCard>
);
