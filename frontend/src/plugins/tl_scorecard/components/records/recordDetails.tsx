import React from "react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import { avatarSeed } from "../avatarSeed";
import type {
  Absence,
  IdleFlag,
  Meeting,
  MeetingAttendeeRole,
  PIPRecord,
  PromotionFlag,
  ReviewDelivery,
} from "../../types/tlScorecard";
import type { RecordKind, RecordRow, Viewer } from "./recordKinds";

export interface DetailItem {
  label: string;
  /** Full, untruncated text content. */
  text?: string | null;
  /** Muted fallback rendered when `text` is empty — set on every note block. */
  emptyText?: string;
  /** Custom content (attendees, weekly log, reference link). */
  node?: React.ReactNode;
  visibility?: "private" | "shared";
  /** Completes the chip copy: "Private — {who}" / "Shared with {who}". */
  sharedWith?: string;
}

/** `Intl` datetime for the recorded/audit timestamps (no hand-rolled formats). */
const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );

const PRIVATE_TO_OWNER = "only you and staff";

const link = (url: string): React.ReactNode => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary break-all underline underline-offset-2"
  >
    {url}
  </a>
);

const reference = (url: string | null | undefined): DetailItem[] =>
  url ? [{ label: "Reference", node: link(url) }] : [];

const ATTENDEE_ROLE_LABELS: Record<MeetingAttendeeRole, string> = {
  member: "Member",
  hrbp: "HRBP",
  observer: "Observer",
};

const attendeeList = (meeting: Meeting): React.ReactNode => {
  const attendees = meeting.attendees ?? [];
  if (attendees.length === 0) {
    return <p className="text-muted-foreground text-sm italic">No attendees recorded.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {attendees.map((attendee) => {
        const name = attendee.user_name ?? "Unknown";
        return (
          <li key={attendee.id}>
            <div className="flex items-center gap-2.5">
              <UserAvatar name={name} size="sm" colorSeed={avatarSeed(name)} />
              <span className="text-sm font-medium">{name}</span>
              <Badge variant="neutral" className="whitespace-nowrap">
                {ATTENDEE_ROLE_LABELS[attendee.role]}
              </Badge>
            </div>
            {/* The API redacts this for everyone but the attendee and staff —
                a blank value means "nothing to show", not "missing". */}
            {attendee.notes && (
              <p className="text-muted-foreground mt-1 ml-9 text-xs whitespace-pre-wrap">
                {attendee.notes}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const weeklyLog = (flag: IdleFlag): React.ReactNode => {
  const updates = flag.status_updates ?? [];
  if (updates.length === 0) {
    return <p className="text-muted-foreground text-sm italic">No weekly updates yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {updates.map((update) => (
        <li key={update.id} className="border-border/60 rounded-xl border p-3">
          <p className="text-foreground text-xs font-semibold">Week of {update.week_of}</p>
          {update.status_note && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">{update.status_note}</p>
          )}
          {update.productivity_task_snapshot && (
            <p className="text-muted-foreground mt-1 text-xs">
              Task: {update.productivity_task_snapshot}
            </p>
          )}
          <p className="text-muted-foreground mt-1.5 text-xs">
            Logged by {update.recorded_by_name ?? "unknown"} · {formatDateTime(update.recorded_at)}
          </p>
        </li>
      ))}
    </ol>
  );
};

const meetingItems = (row: RecordRow): DetailItem[] => {
  const m = row as Meeting;
  return [
    { label: "With", text: m.counterparty_name ?? "Whole team" },
    {
      label: "Notes",
      text: m.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: "visible to you, attendees and staff",
    },
    {
      label: "Shared summary",
      text: m.shared_summary,
      emptyText: "No summary shared yet.",
      visibility: "shared",
      sharedWith: m.counterparty_name ?? "the team",
    },
    ...reference(m.reference_url),
    { label: "Attendees", node: attendeeList(m) },
    ...(m.notes_published_at
      ? [{ label: "Notes published", text: formatDateTime(m.notes_published_at) } as DetailItem]
      : []),
    ...(m.recorded_at
      ? [
          {
            label: "Recorded",
            text: `${formatDateTime(m.recorded_at)}${m.recorded_by_name ? ` by ${m.recorded_by_name}` : ""}`,
          } as DetailItem,
        ]
      : []),
  ];
};

const idleItems = (row: RecordRow): DetailItem[] => {
  const f = row as IdleFlag;
  return [
    { label: "Task assigned", text: f.productivity_task, emptyText: "No task assigned." },
    {
      label: "Notes",
      text: f.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: PRIVATE_TO_OWNER,
    },
    ...reference(f.reference_url),
    { label: "Weekly status log", node: weeklyLog(f) },
    ...(f.resolved_on ? [{ label: "Resolved on", text: f.resolved_on } as DetailItem] : []),
  ];
};

const absenceItems = (row: RecordRow): DetailItem[] => {
  const a = row as Absence;
  return [
    { label: "Reason", text: a.reason, emptyText: "No reason recorded." },
    {
      label: "Notes",
      text: a.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: PRIVATE_TO_OWNER,
    },
    ...reference(a.reference_url),
    ...(a.addressed_on ? [{ label: "Addressed on", text: a.addressed_on } as DetailItem] : []),
  ];
};

const reviewItems = (row: RecordRow): DetailItem[] => {
  const r = row as ReviewDelivery;
  return [
    { label: "Recipient", text: r.recipient },
    { label: "Period", text: r.period },
    {
      label: "Notes",
      text: r.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: PRIVATE_TO_OWNER,
    },
    ...reference(r.reference_url),
    ...(r.recorded_at
      ? [
          {
            label: "Recorded",
            text: `${formatDateTime(r.recorded_at)}${r.recorded_by_name ? ` by ${r.recorded_by_name}` : ""}`,
          } as DetailItem,
        ]
      : []),
  ];
};

const promotionItems = (row: RecordRow): DetailItem[] => {
  const p = row as PromotionFlag;
  return [
    {
      label: "Nomination notes",
      text: p.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: PRIVATE_TO_OWNER,
    },
    ...(p.decision_note ? [{ label: "Decision note", text: p.decision_note } as DetailItem] : []),
    ...(p.decided_on ? [{ label: "Decided on", text: p.decided_on } as DetailItem] : []),
  ];
};

const pipItems = (row: RecordRow): DetailItem[] => {
  const p = row as PIPRecord;
  return [
    {
      label: "Your evidence notes",
      text: p.notes,
      emptyText: "No notes recorded.",
      visibility: "private",
      sharedWith: PRIVATE_TO_OWNER,
    },
    {
      label: "Shared notes",
      text: p.shared_notes,
      emptyText: "Nothing shared with reviewers yet.",
      visibility: "shared",
      sharedWith: "reviewers",
    },
    ...reference(p.reference_url),
    ...(p.status_note ? [{ label: "Status note", text: p.status_note } as DetailItem] : []),
    ...(p.approved_by_name
      ? [
          {
            label: "Approved",
            text: `by ${p.approved_by_name}${p.approved_at ? ` · ${formatDateTime(p.approved_at)}` : ""}`,
          } as DetailItem,
        ]
      : []),
    ...(p.closed_on ? [{ label: "Closed on", text: p.closed_on } as DetailItem] : []),
  ];
};

export const DETAIL_ITEMS: Record<RecordKind, (row: RecordRow, viewer: Viewer) => DetailItem[]> = {
  meetings: meetingItems,
  idle: idleItems,
  absences: absenceItems,
  reviews: reviewItems,
  promotions: promotionItems,
  pips: pipItems,
};
