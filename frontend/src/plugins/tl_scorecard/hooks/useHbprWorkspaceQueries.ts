import { useQuery } from "@tanstack/react-query";
import { tlScorecardService } from "../services/tlScorecardService";
import type {
  Absence,
  HbprEvidence,
  HbprOverview,
  IdleFlag,
  Meeting,
  PIPRecord,
  PromotionFlag,
  ReviewDelivery,
} from "../types/tlScorecard";

/** The governance record families an HBPR may read (never employee 1:1s). */
export type HbprRecordResource =
  | "meetings"
  | "idle-flags"
  | "absences"
  | "review-deliveries"
  | "pip-records"
  | "promotion-flags";

export const HBPR_RECORD_RESOURCES: { value: HbprRecordResource; label: string }[] = [
  { value: "meetings", label: "Meetings" },
  { value: "idle-flags", label: "Idle flags" },
  { value: "absences", label: "Absences" },
  { value: "review-deliveries", label: "Reviews delivered" },
  { value: "pip-records", label: "Improvement plans" },
  { value: "promotion-flags", label: "Promotions" },
];

/**
 * URL `kind` vocabulary for the record-type filter. Shared with the governance
 * notification deep links (`/hbpr?view=records&kind=pips`), so a notification
 * lands on an already-filtered explorer.
 */
export const HBPR_RECORD_KINDS: Record<HbprRecordResource, string> = {
  meetings: "meetings",
  "idle-flags": "idle",
  absences: "absences",
  "review-deliveries": "reviews",
  "pip-records": "pips",
  "promotion-flags": "promotions",
};

const KIND_TO_RESOURCE = new Map<string, HbprRecordResource>(
  Object.entries(HBPR_RECORD_KINDS).map(([resource, kind]) => [
    kind,
    resource as HbprRecordResource,
  ])
);

export const resourceFromKind = (kind: string | null): HbprRecordResource | null =>
  kind ? (KIND_TO_RESOURCE.get(kind) ?? null) : null;

/** A governance record flattened to the columns the explorer renders. */
export interface HbprRecordRow {
  key: string;
  resource: HbprRecordResource;
  id: number;
  subject: string;
  owner_id: number;
  owner_name: string;
  status: string;
  /** ISO date the record is anchored on. */
  date: string;
  detail: string;
}

const person = (name: string | null | undefined, fallback: string) => name?.trim() || fallback;

const toRows = (
  resource: HbprRecordResource,
  rows: unknown[],
  map: (row: never) => Omit<HbprRecordRow, "key" | "resource">
): HbprRecordRow[] =>
  rows.map((row) => {
    const mapped = map(row as never);
    return { ...mapped, key: `${resource}:${mapped.id}`, resource };
  });

const mapMeetings = (m: Meeting) => ({
  id: m.id,
  subject: person(m.counterparty_name, "Team meeting"),
  owner_id: m.organizer,
  owner_name: person(m.organizer_name, "—"),
  status: m.meeting_type,
  date: m.occurred_on,
  detail: m.shared_summary || m.notes || "—",
});

const mapIdle = (f: IdleFlag) => ({
  id: f.id,
  subject: person(f.employee_name, "—"),
  owner_id: f.flagged_by,
  owner_name: person(f.flagged_by_name, "—"),
  status: f.status,
  date: f.flagged_on,
  detail: f.productivity_task || "—",
});

const mapAbsences = (a: Absence) => ({
  id: a.id,
  subject: person(a.employee_name, "—"),
  owner_id: a.flagged_by,
  owner_name: person(a.flagged_by_name, "—"),
  status: a.addressed_on ? "addressed" : "open",
  date: a.absence_date,
  detail: a.reason || "—",
});

// `notes`/`reference_url` are the TL's private record (the API redacts them for
// a non-owner) — the period is the visible substance, so never surface notes here.
const mapReviews = (r: ReviewDelivery) => ({
  id: r.id,
  subject: person(r.recipient, "—"),
  owner_id: r.leader,
  owner_name: person(r.leader_name, "—"),
  status: "delivered",
  date: r.delivered_on,
  detail: r.period || "—",
});

const mapPips = (p: PIPRecord) => ({
  id: p.id,
  subject: person(p.employee_name, "—"),
  owner_id: p.tl,
  owner_name: person(p.tl_name, "—"),
  status: p.status,
  date: p.start_date,
  detail: p.status_note || "—",
});

const mapPromotions = (p: PromotionFlag) => ({
  id: p.id,
  subject: person(p.employee_name, "—"),
  owner_id: p.nominated_by,
  owner_name: person(p.nominated_by_name, "—"),
  status: p.status,
  date: p.nominated_on,
  detail: p.decision_note || "—",
});

/** Read-only governance records for the HBPR's assignments, newest first. */
export const fetchHbprGovernanceRecords = async (): Promise<HbprRecordRow[]> => {
  const [meetings, idle, absences, reviews, pips, promotions] = await Promise.all([
    tlScorecardService.listMeetings(),
    tlScorecardService.listIdleFlags(),
    tlScorecardService.listAbsences(),
    tlScorecardService.listReviewDeliveries(),
    tlScorecardService.listPIPRecords(),
    tlScorecardService.listPromotionFlags(),
  ]);
  return [
    ...toRows("meetings", meetings, mapMeetings),
    ...toRows("idle-flags", idle, mapIdle),
    ...toRows("absences", absences, mapAbsences),
    ...toRows("review-deliveries", reviews, mapReviews),
    ...toRows("pip-records", pips, mapPips),
    ...toRows("promotion-flags", promotions, mapPromotions),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)));
};

/** Evidence within a reporting year: cadence meetings by date, EPR rows by year. */
export const evidenceForYear = (rows: HbprEvidence[], year: number): HbprEvidence[] =>
  rows.filter((row) =>
    row.kind === "cadence_meeting"
      ? row.occurred_on.startsWith(String(year))
      : row.reporting_year === year
  );

export interface HbprWorkspaceQueries {
  overview: ReturnType<typeof useQuery<HbprOverview>>;
  evidence: ReturnType<typeof useQuery<HbprEvidence[]>>;
  records: ReturnType<typeof useQuery<HbprRecordRow[]>>;
}

export function useHbprWorkspaceQueries({
  year,
  includeRecords,
}: {
  year: number;
  includeRecords: boolean;
}): HbprWorkspaceQueries {
  const overview = useQuery({
    queryKey: ["tl-scorecard", "hbpr-overview", year],
    queryFn: async () => (await tlScorecardService.getHbprOverview(year)).data,
  });

  // Fetched without the API `year` filter: a cadence meeting carries no
  // reporting year, so a server-side year filter would silently drop it. The
  // reporting year is applied in `evidenceForYear` instead.
  const evidence = useQuery({
    queryKey: ["tl-scorecard", "hbpr-evidence"],
    queryFn: () => tlScorecardService.listHbprEvidence(),
  });

  const records = useQuery({
    queryKey: ["tl-scorecard", "hbpr-records"],
    queryFn: fetchHbprGovernanceRecords,
    // Only on the records view, and only once we know the viewer is an HBPR —
    // otherwise a non-HBPR deep link fires six doomed 403 requests first.
    enabled: includeRecords && overview.isSuccess,
  });

  return { overview, evidence, records };
}
