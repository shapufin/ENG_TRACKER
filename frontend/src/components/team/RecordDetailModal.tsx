import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import {
  Calendar,
  Clock,
  Building,
  FileText,
  Tag,
  Paperclip,
  Hash,
  User,
  Layers,
  Scale,
  AlertCircle,
  BadgeCheck,
  Timer,
  X,
} from "lucide-react";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import { formatDateDDMMYYYY, formatDateTime } from "@/lib/date-format-utils";

interface RecordDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: OvertimeLog | StandbyLog | LeaveRequest | null;
}

const isOvertimeLog = (record: unknown): record is OvertimeLog => {
  return (
    record !== null &&
    typeof record === "object" &&
    "client_name" in record &&
    "evidence_type" in record
  );
};

const isStandbyLog = (record: unknown): record is StandbyLog => {
  return (
    record !== null &&
    typeof record === "object" &&
    "pattern_name" in record &&
    !("client_name" in record)
  );
};

const isLeaveRequest = (record: unknown): record is LeaveRequest => {
  return (
    record !== null &&
    typeof record === "object" &&
    "request_type" in record &&
    "days_requested" in record
  );
};

interface DetailField {
  label: string;
  value: string | number | null | undefined;
  icon: React.ElementType;
}

// Free-text values (evidence notes, reasons, descriptions, ticket lists)
// wrap instead of truncating so no content is hidden behind a tooltip.
const LONG_TEXT_FIELD_LABELS = new Set([
  "Evidence",
  "Rejection Reason",
  "Reason",
  "Description",
  "Ticket References",
]);

const formatTime = (time: string | null | undefined) => {
  if (!time) return "-";
  return time;
};

const getBaseLogFields = (record: {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
}): DetailField[] => [
  { label: "Date", value: formatDateDDMMYYYY(record.date), icon: Calendar },
  { label: "Start Time", value: formatTime(record.start_time), icon: Clock },
  { label: "End Time", value: formatTime(record.end_time), icon: Clock },
  { label: "Hours", value: record.hours, icon: Timer },
];

const getOvertimeFields = (record: OvertimeLog): DetailField[] => {
  const fields: DetailField[] = [
    ...getBaseLogFields(record),
    { label: "Client", value: record.client_name || "-", icon: Building },
    { label: "Description", value: record.description || "-", icon: FileText },
    { label: "Evidence Type", value: record.evidence_type || "-", icon: Tag },
  ];
  if (record.evidence_type === "ticket") {
    if (record.ticket_references?.length) {
      fields.push({
        label: "Ticket References",
        value: record.ticket_references.join(", "),
        icon: Hash,
      });
    }
    if (record.evidence) {
      fields.push({ label: "Evidence", value: record.evidence, icon: Paperclip });
    }
    if (record.reference_code) {
      fields.push({ label: "Reference Code", value: record.reference_code, icon: Hash });
    }
  } else {
    fields.push({ label: "Evidence", value: record.evidence || "-", icon: Paperclip });
    fields.push({ label: "Reference Code", value: record.reference_code || "-", icon: Hash });
  }
  fields.push(
    { label: "Approved By", value: record.approved_by_name || "-", icon: User },
    {
      label: "Approved At",
      value: record.approved_at ? formatDateTime(record.approved_at) : "-",
      icon: Calendar,
    },
    { label: "Rejection Reason", value: record.rejection_reason || "-", icon: AlertCircle }
  );
  return fields;
};

const getStandbyFields = (record: StandbyLog): DetailField[] => [
  ...getBaseLogFields(record),
  { label: "Pattern", value: record.pattern_name || "-", icon: Layers },
  { label: "Description", value: record.description || "-", icon: FileText },
  { label: "Evidence", value: record.evidence || "-", icon: Paperclip },
  { label: "Approved By", value: record.approved_by_name || "-", icon: User },
  {
    label: "Approved At",
    value: record.approved_at ? formatDateTime(record.approved_at) : "-",
    icon: Calendar,
  },
  { label: "Rejection Reason", value: record.rejection_reason || "-", icon: AlertCircle },
];

const getLeaveFields = (record: LeaveRequest): DetailField[] => [
  { label: "Start Date", value: formatDateDDMMYYYY(record.start_date), icon: Calendar },
  { label: "End Date", value: formatDateDDMMYYYY(record.end_date), icon: Calendar },
  { label: "Days Requested", value: record.days_requested, icon: Timer },
  { label: "Type", value: record.request_type_display || record.request_type || "-", icon: Tag },
  { label: "Reason", value: record.reason || "-", icon: FileText },
  {
    label: "Balance Left",
    value: record.user_leave_balance ? `${record.user_leave_balance}d` : "-",
    icon: Scale,
  },
  { label: "Approved By", value: record.approved_by_name || "-", icon: User },
  {
    label: "Approved At",
    value: record.approved_at ? formatDateTime(record.approved_at) : "-",
    icon: Calendar,
  },
  { label: "Rejection Reason", value: record.rejection_reason || "-", icon: AlertCircle },
];

const getStatusStyles = (status: string) => {
  switch (status) {
    case "approved":
      return toneSurfaceClass.success;
    case "rejected":
      return toneSurfaceClass.danger;
    case "cancelled":
      return "bg-muted/30 text-muted-foreground border-muted-foreground/20 shadow-muted-foreground/10";
    default:
      return toneSurfaceClass.warning;
  }
};

const getRecordType = (record: OvertimeLog | StandbyLog | LeaveRequest): string => {
  if (isOvertimeLog(record)) return "Overtime";
  if (isStandbyLog(record)) return "Standby";
  if (isLeaveRequest(record)) return record.request_type_display || record.request_type;
  return "Record";
};

const getRecordIcon = (record: OvertimeLog | StandbyLog | LeaveRequest): React.ElementType => {
  if (isOvertimeLog(record)) return Timer;
  if (isStandbyLog(record)) return Layers;
  if (isLeaveRequest(record)) return Calendar;
  return FileText;
};

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  open,
  onOpenChange,
  record,
}) => {
  if (!record) return null;

  const recordType = getRecordType(record);
  const userName = record.user_full_name || record.user_name || "Unknown";
  const recordIcon = getRecordIcon(record);
  const fields = isOvertimeLog(record)
    ? getOvertimeFields(record)
    : isStandbyLog(record)
      ? getStandbyFields(record)
      : getLeaveFields(record);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose padded={false}>
        <DialogTitle className="sr-only">Record Details</DialogTitle>
        <DialogDescription className="sr-only">
          View details for {recordType} record for {userName}
        </DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          {/* Header */}
          <div className="mb-5 flex shrink-0 items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl",
                  "border border-accent-violet/20",
                  "bg-accent-violet/10 backdrop-blur-xl",
                  "shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                )}
              >
                {React.createElement(recordIcon, { className: "h-6 w-6 text-accent-violet" })}
              </div>

              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {recordType}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{userName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1",
                  "text-xs font-medium capitalize backdrop-blur-xl",
                  "shadow-sm",
                  getStatusStyles(record.status)
                )}
              >
                <BadgeCheck className="h-3 w-3" />
                {record.status}
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

          {/* Content */}
          <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {fields.map((field, index) => {
              const Icon = field.icon;
              const isLongText = LONG_TEXT_FIELD_LABELS.has(field.label);

              return (
                <div
                  key={index}
                  className={cn(
                    "group relative overflow-hidden rounded-xl",
                    "border border-border",
                    "bg-muted/40",
                    "transition-all duration-300",
                    "hover:border-accent-violet/30 hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-3 p-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        "border border-accent-violet/10",
                        "bg-accent-violet/10",
                        "transition-all duration-300",
                        "group-hover:scale-105 group-hover:bg-accent-violet/15"
                      )}
                    >
                      <Icon className="h-4 w-4 text-accent-violet" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-micro font-medium uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </p>
                      <p
                        className={
                          isLongText
                            ? "break-words text-sm font-medium text-foreground"
                            : "truncate text-sm font-medium text-foreground"
                        }
                        title={String(field.value ?? "-")}
                      >
                        {field.value ?? "-"}
                      </p>
                    </div>
                  </div>

                  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute inset-y-0 left-0 w-[1.5px] bg-accent-violet" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
