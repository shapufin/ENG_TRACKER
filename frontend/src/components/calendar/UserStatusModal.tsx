import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plane, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneTextClass } from "@/components/ui/tone";
import type { LeaveBalance, User as UserType, PublicHoliday } from "@/types";
import { UserAvatar } from "./UserAvatar";
import { StatCard } from "./StatCard";
import { CarryOverCard } from "./CarryOverCard";
import { UpcomingHolidays } from "./UpcomingHolidays";
import { useUserStatusData } from "./hooks/useUserStatusData";
import { formatCompactDays } from "./hooks/userStatusHelpers";

interface UserStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserType;
  vacationBalances?: LeaveBalance[];
  holidays?: PublicHoliday[];
}

export const UserStatusModal: React.FC<UserStatusModalProps> = ({
  open,
  onOpenChange,
  user,
  vacationBalances = [],
  holidays = [],
}) => {
  const {
    hasBalanceData,
    remainingDays,
    usedDays,
    pendingDays,
    totalDays,
    vacationYear,
    carryOverDetail,
    remainingProgress,
    usedProgress,
    pendingProgress,
    carryOverProgress,
    upcomingHolidays,
  } = useUserStatusData(vacationBalances, holidays);

  const primaryTeam = user.teams?.[0]?.name;
  const userName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  const remainingPct = Math.round(remainingProgress);
  // Normalized shares so the stacked bar always sums to exactly 100 even for
  // inconsistent snapshots (remaining + used + pending != total).
  const barTotal = remainingDays + usedDays + pendingDays;
  const barShare = (v: number) => (barTotal > 0 ? Math.min(100, (v / barTotal) * 100) : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose padded={false} className="pointer-events-auto">
        <DialogTitle className="sr-only">Vacation Balance</DialogTitle>
        <DialogDescription className="sr-only">
          Overview of vacation, carry-over and upcoming holidays for {user.first_name}{" "}
          {user.last_name}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 p-5 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tone-accent-surface">
                    <Plane className="h-5 w-5 text-tone-accent-text" />
                  </div>
                  <h2 className="truncate text-xl font-semibold tracking-tight">
                    Vacation balance
                  </h2>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <div className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-card p-3">
                <UserAvatar size="md" name={userName} email={user.email} colorSeed={user.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{userName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                {primaryTeam && (
                  <Badge className="shrink-0 rounded-full border-0 bg-tone-accent-surface px-2.5 py-0.5 text-micro-lg text-tone-accent-text hover:bg-tone-accent-surface">
                    {primaryTeam}
                  </Badge>
                )}
              </div>

              {!hasBalanceData ? (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-5 text-muted-foreground dark:text-muted-foreground">
                  <Info className="h-5 w-5" />
                  <span>No balance data available for this user.</span>
                </div>
              ) : (
                <>
                  <div className="mt-3 rounded-2xl border border-line-subtle bg-card p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-mono tabular-nums">
                        <span className="text-2xl font-bold text-foreground">
                          {formatCompactDays(remainingDays)}
                        </span>{" "}
                        <span className="text-sm text-muted-foreground">
                          of {formatCompactDays(totalDays)} d remaining
                        </span>
                      </p>
                      <span className={cn("font-mono text-xs font-bold", toneTextClass.success)}>
                        {remainingPct}% left
                      </span>
                    </div>
                    <div
                      role="img"
                      aria-label={`Vacation balance: ${formatCompactDays(remainingDays)} of ${formatCompactDays(totalDays)} days remaining`}
                      className="mt-3 flex h-2 w-full overflow-hidden rounded-full border border-line-subtle bg-surface-sunken"
                    >
                      <div
                        className="h-full bg-success"
                        style={{ width: `${barShare(remainingDays)}%` }}
                      />
                      <div
                        className="h-full bg-warning"
                        style={{ width: `${barShare(pendingDays)}%` }}
                      />
                      <div
                        className="h-full bg-destructive"
                        style={{ width: `${barShare(usedDays)}%` }}
                      />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro-lg text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn("inline-flex", toneTextClass.success)}
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        </span>
                        Remaining {formatCompactDays(remainingDays)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn("inline-flex", toneTextClass.warning)}
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        </span>
                        Pending {formatCompactDays(pendingDays)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn("inline-flex", toneTextClass.danger)}
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        </span>
                        Used {formatCompactDays(usedDays)}
                      </span>
                    </div>
                    <p className="mt-2.5 text-micro-lg text-muted-foreground">
                      {vacationYear} allowance · resets 1 Jan · carry-over expires 31 Mar
                    </p>
                  </div>
                  <div className="mb-8 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatCard
                      label="Remaining"
                      value={formatCompactDays(remainingDays)}
                      suffix="d"
                      sub={`${Math.round(remainingProgress)}% of ${formatCompactDays(totalDays)} d`}
                      tone="success"
                    />
                    <StatCard
                      label="Used"
                      value={formatCompactDays(usedDays)}
                      suffix="d"
                      sub={`${Math.round(usedProgress)}% of ${formatCompactDays(totalDays)} d`}
                      tone="danger"
                    />
                    <StatCard
                      label="Pending"
                      value={formatCompactDays(pendingDays)}
                      suffix="d"
                      sub={`${Math.round(pendingProgress)}% of ${formatCompactDays(totalDays)} d`}
                      tone="warning"
                    />
                  </div>
                  <CarryOverCard
                    carryOverDetail={carryOverDetail}
                    carryOverProgress={carryOverProgress}
                  />
                  <UpcomingHolidays holidays={upcomingHolidays} />
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
