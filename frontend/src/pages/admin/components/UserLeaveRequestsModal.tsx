import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { LoadingCard } from "@/components/ui/LoadingCard";
import {
  Calendar,
  ArrowRight,
  Sun,
  Stethoscope,
  Check,
  X,
  Trash2,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { leaveDaysLabel } from "@/components/leave/leaveDuration";
import { leaveService } from "@/services/leaveService";
import type { LeaveRequest } from "@/types";

export interface SelectedUserTarget {
  userId: number;
  userName: string;
  userFullName: string;
  userCode?: string | null;
  teamName?: string;
  userLeaveBalance?: number;
}

interface UserLeaveRequestsModalProps {
  user: SelectedUserTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
}

/**
 * Modal displaying all vacation and leave records for a specific employee.
 * Features a high-efficiency 1-row range bar (Start -> End + Total duration)
 * with individual status badges and approval controls.
 */
export const UserLeaveRequestsModal: React.FC<UserLeaveRequestsModalProps> = ({
  user,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onDelete,
  canDelete = false,
}) => {
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const userId = user?.userId;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "leaves", "user-modal-requests", userId],
    queryFn: () => leaveService.getAdminRequests({ user: String(userId), page_size: 100 }),
    enabled: open && Boolean(userId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const requests: LeaveRequest[] = data?.results ?? [];

  // Summary counts for this specific user
  const totalDays = requests.reduce((sum, r) => sum + (Number(r.days_requested) || 0), 0);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const latestBalance = requests[0]?.user_leave_balance ?? user?.userLeaveBalance;

  const handleOpenReject = (id: number) => {
    setRejectionReason("");
    setRejectingId(id);
  };

  const handleConfirmReject = () => {
    if (rejectingId != null) {
      onReject(rejectingId, rejectionReason);
      setRejectingId(null);
      setRejectionReason("");
    }
  };

  const handleConfirmDelete = () => {
    if (deletingId != null && onDelete) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader className="border-line-subtle border-b pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
                    {user?.userFullName?.slice(0, 2).toUpperCase() || (
                      <UserIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <DialogTitle className="text-base leading-tight font-semibold">
                      {user?.userFullName || "Employee Leave Records"}
                    </DialogTitle>
                    {user?.userName && (
                      <p className="text-muted-foreground font-mono text-xs">@{user.userName}</p>
                    )}
                  </div>
                </div>
                <DialogDescription className="text-xs">
                  {user?.teamName ? `${user.teamName} · ` : ""}
                  Historical and pending leave requests
                </DialogDescription>
              </div>

              {/* Header metrics strip */}
              <div className="flex flex-wrap items-center gap-2">
                {latestBalance != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs font-medium">Balance Left:</span>
                    <LeaveBalanceBadge balance={latestBalance} />
                  </div>
                )}
                <div className="bg-surface-sunken border-line-subtle text-foreground inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs">
                  <span className="font-mono font-bold tabular-nums">{requests.length}</span>
                  <span className="text-muted-foreground">
                    {requests.length === 1 ? "request" : "requests"} ·
                  </span>
                  <span className="font-mono font-bold tabular-nums">{totalDays}</span>
                  <span className="text-muted-foreground">
                    {totalDays === 1 ? "day total" : "days total"}
                  </span>
                </div>
                {pendingCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-tone-warning-border bg-tone-warning-surface text-tone-warning-text text-xs"
                  >
                    <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                    {pendingCount} pending
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-3 py-4">
            {isLoading ? (
              <LoadingCard rows={4} className="min-h-[220px]" />
            ) : requests.length === 0 ? (
              <div className="border-line-subtle bg-surface-sunken/40 rounded-xl border border-dashed py-12 text-center">
                <Calendar
                  className="text-muted-foreground mx-auto mb-2 h-8 w-8 opacity-50"
                  aria-hidden="true"
                />
                <p className="text-foreground text-sm font-medium">No leave records found</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  This employee currently has no recorded leave submissions.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {requests.map((req) => {
                  const isPending = req.status === "pending";
                  const startStr = formatDateDDMMYYYY(req.start_date);
                  const endStr = formatDateDDMMYYYY(req.end_date);
                  const durationStr = `${leaveDaysLabel(req)} ${
                    Number(req.days_requested) === 1 ? "day" : "days"
                  }`;

                  return (
                    <div
                      key={req.id}
                      className="border-line-subtle bg-surface-sunken/40 hover:bg-surface-sunken/70 rounded-xl border p-3.5 transition-colors"
                    >
                      {/* High-efficiency 1-row range bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <div className="bg-popover border-line-subtle text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-medium tabular-nums shadow-xs">
                            <Calendar
                              className="text-muted-foreground h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span>{startStr}</span>
                            <ArrowRight
                              className="text-muted-foreground h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>{endStr}</span>
                          </div>
                          <span className="text-muted-foreground text-xs font-medium">Total:</span>
                          <span className="bg-popover border-line-subtle text-foreground inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums shadow-xs">
                            {durationStr}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={req.request_type === "vacation" ? "default" : "secondary"}
                          >
                            {req.request_type === "vacation" ? (
                              <Sun className="mr-1 h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Stethoscope className="mr-1 h-3 w-3" aria-hidden="true" />
                            )}
                            {req.request_type === "vacation" ? "Vacation" : "Sick Leave"}
                          </Badge>
                          <StatusBadge variant={req.status as StatusVariant} />
                        </div>
                      </div>

                      {/* Optional employee reason */}
                      {req.reason && (
                        <div className="border-line-subtle/70 mt-2.5 border-t pt-2">
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            <span className="text-foreground font-medium">Reason: </span>
                            {req.reason}
                          </p>
                        </div>
                      )}

                      {/* Rejection notice if present */}
                      {req.rejection_reason && (
                        <div className="border-line-subtle/70 mt-2 border-t pt-2">
                          <p className="text-tone-danger-text text-xs leading-relaxed">
                            <span className="font-medium">Rejection note: </span>
                            {req.rejection_reason}
                          </p>
                        </div>
                      )}

                      {/* Action controls */}
                      {(isPending || (canDelete && onDelete)) && (
                        <div className="border-line-subtle/60 mt-3 flex items-center justify-end gap-2 border-t pt-2.5">
                          {isPending && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                aria-label={`Approve leave from ${startStr} to ${endStr}`}
                                onClick={() => onApprove(req.id)}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={`Reject leave from ${startStr} to ${endStr}`}
                                onClick={() => handleOpenReject(req.id)}
                              >
                                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                Reject
                              </Button>
                            </>
                          )}
                          {canDelete && onDelete && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-tone-danger-text hover:bg-tone-danger-surface"
                              aria-label={`Delete leave from ${startStr} to ${endStr}`}
                              onClick={() => setDeletingId(req.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Reject reason confirmation dialog */}
      <ConfirmDialog
        open={rejectingId != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRejectingId(null);
            setRejectionReason("");
          }
        }}
        title="Reject Leave Request"
        description="Provide a reason for the employee explaining why this leave is rejected:"
        icon={<X className="h-4 w-4" />}
        confirmLabel="Reject Request"
        variant="destructive"
        onConfirm={handleConfirmReject}
      >
        <div className="pt-2">
          <Input
            placeholder="Reason for rejection (e.g. shift coverage, insufficient notice)"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            autoFocus
          />
        </div>
      </ConfirmDialog>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deletingId != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeletingId(null);
        }}
        title="Delete Leave Request"
        description="Permanently delete this leave record? The employee's leave balance will be restored automatically."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};
