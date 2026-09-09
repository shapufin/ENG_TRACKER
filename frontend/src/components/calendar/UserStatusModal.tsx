import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plane, Info, X, CalendarDays, Clock3, Hourglass } from "lucide-react";
import type { LeaveBalance, User as UserType, PublicHoliday } from "@/types";
import { UserAvatar } from "./UserAvatar";
import { StatCard } from "./StatCard";
import { CarryOverCard } from "./CarryOverCard";
import { CurrentYearCard } from "./CurrentYearCard";
import { UpcomingHolidays } from "./UpcomingHolidays";
import { useUserStatusData } from "./hooks/useUserStatusData";

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
    currentDetail,
    remainingProgress,
    usedProgress,
    pendingProgress,
    carryOverProgress,
    upcomingHolidays,
  } = useUserStatusData(vacationBalances, holidays);

  const primaryTeam = user.teams?.[0]?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pointer-events-auto flex max-h-[90vh] max-w-2xl flex-col overflow-hidden border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop-blur-xl sm:rounded-3xl [&>button]:hidden">
        <DialogTitle className="sr-only">Vacation Balance</DialogTitle>
        <DialogDescription className="sr-only">
          Overview of vacation, carry-over and upcoming holidays for {user.first_name}{" "}
          {user.last_name}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_bottom_left,hsl(var(--info)/0.10),transparent_25%)]" />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 p-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15">
                    <Plane className="h-7 w-7 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-semibold tracking-tight">Vacation balance</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Overview of vacation, carry-over and upcoming holidays
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="relative mb-6 overflow-hidden rounded-3xl border border-line-subtle bg-card-raised p-5">
                <div className="absolute right-0 top-0 h-full w-[40%] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_70%)]" />
                <div className="relative flex items-center gap-4">
                  <div className="h-16 w-16">
                    <UserAvatar
                      size="lg"
                      name={`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()}
                      email={user.email}
                      colorSeed={user.id}
                      className="h-16 w-16 border border-border dark:border-line-subtle"
                    />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold">
                      {user.first_name} {user.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    {primaryTeam && (
                      <Badge className="mt-2 rounded-full border-0 bg-indigo-500/15 px-3 py-1 text-indigo-300 hover:bg-indigo-500/15">
                        {primaryTeam}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {!hasBalanceData ? (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted p-5 text-muted-foreground dark:text-muted-foreground">
                  <Info className="h-5 w-5" />
                  <span>No balance data available for this user.</span>
                </div>
              ) : (
                <>
                  <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
                    <StatCard
                      icon={<CalendarDays className="h-6 w-6 text-indigo-400" />}
                      label="Remaining"
                      value={remainingDays.toFixed(2)}
                      suffix="d"
                      sub={`out of ${totalDays.toFixed(2)} d`}
                      progress={remainingProgress}
                      color="bg-indigo-500"
                    />
                    <StatCard
                      icon={<Clock3 className="h-6 w-6 text-pink-400" />}
                      label="Used"
                      value={usedDays.toFixed(2)}
                      suffix="d"
                      sub={`out of ${totalDays.toFixed(2)} d`}
                      progress={usedProgress}
                      color="bg-pink-500"
                    />
                    <StatCard
                      icon={<Hourglass className="h-6 w-6 text-amber-400" />}
                      label="Pending"
                      value={pendingDays.toFixed(2)}
                      suffix="d"
                      sub={`out of ${totalDays.toFixed(2)} d`}
                      progress={pendingProgress}
                      color="bg-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <CarryOverCard
                      carryOverDetail={carryOverDetail}
                      carryOverProgress={carryOverProgress}
                    />
                    <CurrentYearCard currentDetail={currentDetail} vacationYear={vacationYear} />
                  </div>
                  <UpcomingHolidays holidays={upcomingHolidays} />
                  <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Info className="h-3 w-3" />
                    Carry-over days automatically expire on 31 March if unused.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
