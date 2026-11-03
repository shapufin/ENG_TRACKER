import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plane, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneTextClass } from "@/components/ui/tone";
import type { LeaveBalance, User as UserType, PublicHoliday } from "@/types";
import type { CalendarEvent } from "./types";
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
  userEvents?: CalendarEvent[];
}

export const UserStatusModal: React.FC<UserStatusModalProps> = ({
  open,
  onOpenChange,
  user,
  vacationBalances = [],
  holidays = [],
  userEvents = [],
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "policy">("overview");

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
          Overview of vacation, carry-over, history and rules for {user.first_name} {user.last_name}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 p-5 pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-tone-accent-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs">
                    <Plane className="text-tone-accent-text h-5 w-5 -rotate-45" />
                  </div>
                  <div>
                    <h2 className="truncate text-xl font-bold tracking-tight">Vacation balance</h2>
                    <p className="text-muted-foreground text-xs">
                      Annual leave entitlement &amp; holiday calendar
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors focus-visible:ring-1 focus-visible:outline-none"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="border-border/60 flex shrink-0 items-center gap-4 border-b px-5 pt-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "relative cursor-pointer pb-2.5 transition-colors",
                  activeTab === "overview"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Overview &amp; Holidays
                {activeTab === "overview" && (
                  <span className="bg-primary absolute right-0 bottom-0 left-0 h-0.5 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "relative cursor-pointer pb-2.5 transition-colors",
                  activeTab === "history"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Leave History
                {userEvents && userEvents.length > 0 && (
                  <span className="bg-muted text-muted-foreground py-0.2 ml-1.5 rounded-full px-1.5 font-mono text-[10px]">
                    {userEvents.length}
                  </span>
                )}
                {activeTab === "history" && (
                  <span className="bg-primary absolute right-0 bottom-0 left-0 h-0.5 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("policy")}
                className={cn(
                  "relative cursor-pointer pb-2.5 transition-colors",
                  activeTab === "policy"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Policy &amp; Rules
                {activeTab === "policy" && (
                  <span className="bg-primary absolute right-0 bottom-0 left-0 h-0.5 rounded-full" />
                )}
              </button>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="border-line-subtle bg-card flex items-center gap-3 rounded-2xl border p-3">
                <UserAvatar size="md" name={userName} email={user.email} colorSeed={user.id} />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-base font-semibold">{userName}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
                {primaryTeam && (
                  <Badge className="bg-tone-accent-surface text-tone-accent-text hover:bg-tone-accent-surface shrink-0 rounded-full border-0 px-2.5 py-0.5 text-xs">
                    {primaryTeam}
                  </Badge>
                )}
              </div>

              {activeTab === "overview" && (
                <>
                  {!hasBalanceData ? (
                    <div className="border-border bg-muted text-muted-foreground mt-3 flex items-center gap-3 rounded-2xl border border-dashed p-5">
                      <Info className="h-5 w-5" />
                      <span>No balance data available for this user.</span>
                    </div>
                  ) : (
                    <>
                      <div className="border-line-subtle bg-card mt-3 rounded-2xl border p-4">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-mono tabular-nums">
                            <span className="text-foreground text-2xl font-bold">
                              {formatCompactDays(remainingDays)}
                            </span>{" "}
                            <span className="text-muted-foreground text-sm">
                              of {formatCompactDays(totalDays)} d remaining
                            </span>
                          </p>
                          <span
                            className={cn("font-mono text-xs font-bold", toneTextClass.success)}
                          >
                            {remainingPct}% left
                          </span>
                        </div>
                        <div
                          role="img"
                          aria-label={`Vacation balance: ${formatCompactDays(remainingDays)} of ${formatCompactDays(totalDays)} days remaining`}
                          className="border-line-subtle bg-surface-sunken mt-3 flex h-2 w-full overflow-hidden rounded-full border"
                        >
                          <div
                            className="bg-success h-full"
                            style={{ width: `${barShare(remainingDays)}%` }}
                          />
                          <div
                            className="bg-warning h-full"
                            style={{ width: `${barShare(pendingDays)}%` }}
                          />
                          <div
                            className="bg-destructive h-full"
                            style={{ width: `${barShare(usedDays)}%` }}
                          />
                        </div>
                        <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
                        <p className="text-muted-foreground mt-2.5 text-xs">
                          {vacationYear} allowance · resets 1 Jan · carry-over expires 31 Mar
                        </p>
                      </div>
                      <div className="mt-3 mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                </>
              )}

              {activeTab === "history" && (
                <div className="mt-3">
                  {!userEvents || userEvents.length === 0 ? (
                    <div className="border-border bg-muted/40 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-xs">
                      No previous time-off logged for this period.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userEvents.map((evt) => {
                        const start = parseISO(evt.start);
                        const end = parseISO(evt.end);
                        const dateFormat =
                          start.getFullYear() === end.getFullYear() ? "MMM d" : "PP";
                        const dateRange =
                          evt.start === evt.end
                            ? format(start, dateFormat)
                            : `${format(start, dateFormat)} → ${format(end, dateFormat)}`;
                        const duration =
                          typeof evt.days === "number"
                            ? `${evt.days} ${evt.days === 1 ? "day" : "days"}`
                            : evt.hours != null
                              ? `${evt.hours} ${evt.hours === 1 ? "hour" : "hours"}`
                              : null;

                        const statusStyle =
                          evt.status === "approved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : evt.status === "pending"
                              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300";

                        return (
                          <div
                            key={evt.id}
                            className="border-line-subtle bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground text-xs font-bold capitalize">
                                  {evt.type}
                                </span>
                                {duration && (
                                  <span className="text-muted-foreground font-mono text-[11px]">
                                    ({duration})
                                  </span>
                                )}
                              </div>
                              <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                                {dateRange}
                              </p>
                              {evt.description && (
                                <p className="text-muted-foreground mt-1 text-xs italic">
                                  "{evt.description}"
                                </p>
                              )}
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase",
                                statusStyle
                              )}
                            >
                              {evt.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "policy" && (
                <div className="mt-3 space-y-3">
                  <div className="border-line-subtle bg-card rounded-2xl border p-4">
                    <h4 className="text-foreground text-sm font-bold">
                      Allowance &amp; Carryover Rules
                    </h4>
                    <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                      Full-time engineering team members receive annual vacation entitlement per
                      calendar year. Up to 5 unused days may be carried over into the following
                      year, expiring on March 31st.
                    </p>
                  </div>
                  <div className="border-line-subtle bg-card rounded-2xl border p-4">
                    <h4 className="text-foreground text-sm font-bold">Team Coverage Minimums</h4>
                    <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                      Each team requires at least 50% active staffing on standard working days to
                      maintain operational coverage and on-call standby. Staffing conflicts are
                      automatically flagged when coverage drops below threshold.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
