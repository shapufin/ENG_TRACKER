import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { LeaveBalance } from "@/types";

interface LeaveBalanceAuditDialogProps {
  balance: LeaveBalance | null;
  onClose: () => void;
}

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number): string => value.toFixed(2);

const pct = (value: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

const initials = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("") || "?";

/**
 * Read-only allowance audit for one balance row (mockup VacationBalance pattern).
 * All copy derives from the row — no statutory claims are invented.
 */
export const LeaveBalanceAuditDialog: React.FC<LeaveBalanceAuditDialogProps> = ({
  balance,
  onClose,
}) => {
  const remaining = num(balance?.effective_available_days ?? balance?.available_days);
  const used = num(balance?.used_days);
  const pending = num(balance?.pending_days);
  const total = num(balance?.total_days);
  const name = balance?.user_name ?? "Employee";

  return (
    <Dialog open={balance !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Allowance Audit</DialogTitle>
          <DialogDescription>
            Annual allowance, carry-over and scheduled-leave breakdown.
          </DialogDescription>
        </DialogHeader>
        {balance && (
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
            <div className="border-border bg-card flex items-center justify-between rounded-2xl border p-3.5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                >
                  {initials(name)}
                </span>
                <div>
                  <div className="text-sm font-bold">{name}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {balance.leave_type} · {balance.year}
                  </div>
                </div>
              </div>
              {balance.is_carry_over && (
                <span className="border-primary/25 bg-primary/10 text-primary rounded-full border px-2.5 py-1 font-mono text-xs font-semibold">
                  carry-over
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="border-border bg-surface-sunken rounded-2xl border p-3.5">
                <span className="text-muted-foreground text-xs">Remaining</span>
                <div className="mt-0.5 font-mono text-2xl font-black">
                  {fmt(remaining)}
                  <span className="text-muted-foreground text-xs font-normal"> d</span>
                </div>
                <div className="bg-input-bg mt-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    data-testid="audit-progress-remaining"
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${pct(remaining, total)}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-1 font-mono text-xs">
                  {pct(remaining, total)}% of {fmt(total)}d
                </div>
              </div>
              <div className="border-border bg-surface-sunken rounded-2xl border p-3.5">
                <span className="text-muted-foreground text-xs">Used</span>
                <div className="text-tone-danger-text mt-0.5 font-mono text-2xl font-black">
                  {fmt(used)}
                  <span className="text-muted-foreground text-xs font-normal"> d</span>
                </div>
                <div className="bg-input-bg mt-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    data-testid="audit-progress-used"
                    className="bg-tone-danger-text h-full rounded-full"
                    style={{ width: `${pct(used, total)}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-1 font-mono text-xs">
                  {pct(used, total)}% of {fmt(total)}d
                </div>
              </div>
              <div className="border-border bg-surface-sunken rounded-2xl border p-3.5">
                <span className="text-muted-foreground text-xs">Pending review</span>
                <div className="text-tone-warning-text mt-0.5 font-mono text-2xl font-black">
                  {fmt(pending)}
                  <span className="text-muted-foreground text-xs font-normal"> d</span>
                </div>
                <div className="bg-input-bg mt-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    data-testid="audit-progress-pending"
                    className="bg-tone-warning-text h-full rounded-full"
                    style={{ width: `${pct(pending, total)}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-1 font-mono text-xs">
                  {pct(pending, total)}% in review
                </div>
              </div>
            </div>
            <div className="border-line-subtle bg-surface-sunken text-muted-foreground rounded-2xl border p-3.5 text-xs">
              {balance.is_carry_over ? (
                <>
                  <strong className="text-foreground">Carry-over balance.</strong>{" "}
                  {balance.expires_at
                    ? `Expires ${formatDateDDMMYYYY(balance.expires_at)}.`
                    : "No expiry set."}
                </>
              ) : (
                <>
                  <strong className="text-foreground">
                    {balance.year} {balance.leave_type} allowance.
                  </strong>{" "}
                  {balance.expires_at
                    ? `Expires ${formatDateDDMMYYYY(balance.expires_at)}.`
                    : "No expiry set."}
                </>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
