import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tlScorecardService } from "../services/tlScorecardService";
import type {
  Absence,
  HbprEvidence,
  HbprEvidenceKind,
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

export const HBPR_RECORD_PAGE_SIZE = 25;
export const HBPR_EVIDENCE_PAGE_SIZE = 50; // DRF page size (settings PAGE_SIZE)
export const DEFAULT_RECORD_RESOURCE: HbprRecordResource = "meetings";

/** Statuses the API's `?status=` filter accepts per kind (reviews have none). */
export const HBPR_RECORD_STATUSES: Record<HbprRecordResource, string[]> = {
  meetings: ["team_meeting", "tl_sync"],
  "idle-flags": ["open", "resolved"],
  absences: ["open", "addressed"],
  "review-deliveries": [],
  "pip-records": ["draft", "active", "completed", "cancelled"],
  "promotion-flags": ["nominated", "promoted", "declined"],
};

const ROW_MAPPERS: Record<
  HbprRecordResource,
  (row: never) => Omit<HbprRecordRow, "key" | "resource">
> = {
  meetings: mapMeetings,
  "idle-flags": mapIdle,
  absences: mapAbsences,
  "review-deliveries": mapReviews,
  "pip-records": mapPips,
  "promotion-flags": mapPromotions,
};

export interface HbprRecordQuery {
  resource: HbprRecordResource;
  leader: number | null;
  status: string;
  period: string;
  /** Server-side text search (same `?q=` semantics as the resource endpoints). */
  q: string;
  /** 1-based page number. */
  page: number;
}

export interface HbprRecordsPage {
  count: number;
  rows: HbprRecordRow[];
}

/** One server-side page of governance records (never employee 1:1s). */
const fetchHbprRecordsPage = async (query: HbprRecordQuery): Promise<HbprRecordsPage> => {
  const { data } = await tlScorecardService.getHbprRecordsPage({
    kind: HBPR_RECORD_KINDS[query.resource],
    ...(query.leader !== null && { leader: query.leader }),
    ...(query.status && { status: query.status }),
    ...(query.period && { period: query.period }),
    ...(query.q && { q: query.q }),
    limit: HBPR_RECORD_PAGE_SIZE,
    offset: (query.page - 1) * HBPR_RECORD_PAGE_SIZE,
  });
  return {
    count: data.count,
    rows: toRows(query.resource, data.results, ROW_MAPPERS[query.resource]),
  };
};

/** Evidence within a reporting year: cadence meetings by date, EPR rows by year. */
export const evidenceForYear = (rows: HbprEvidence[], year: number): HbprEvidence[] =>
  rows.filter((row) =>
    row.kind === "cadence_meeting"
      ? row.occurred_on.startsWith(String(year))
      : row.reporting_year === year
  );

export interface HbprEvidencePage {
  count: number;
  rows: HbprEvidence[];
}

export interface HbprWorkspaceQueries {
  overview: ReturnType<typeof useQuery<HbprOverview>>;
  evidence: ReturnType<typeof useQuery<HbprEvidencePage>>;
  records: ReturnType<typeof useQuery<HbprRecordsPage>>;
  /** Per-kind counts for the sidebar (leader + period scope, no status). */
  recordsSummary: ReturnType<typeof useQuery<Record<string, number>>>;
  /** `leaderParam`, or null when it is not one of the assigned leaders. */
  leader: number | null;
}

export function useHbprWorkspaceQueries({
  year,
  view,
  leaderParam,
  record,
  evidencePage,
  evidenceKind,
}: {
  year: number;
  view: string;
  /** Raw `?leader=` value; dropped when it is not one of the assigned leaders. */
  leaderParam: number | null;
  record: Omit<HbprRecordQuery, "leader">;
  evidencePage: number;
  /** One meeting type, or undefined for all (the API filters `?kind=`). */
  evidenceKind?: HbprEvidenceKind;
}): HbprWorkspaceQueries {
  const overview = useQuery({
    queryKey: ["tl-scorecard", "hbpr-overview", year],
    queryFn: async () => (await tlScorecardService.getHbprOverview(year)).data,
  });

  // An out-of-scope `?leader=` id is dropped rather than trusted: the filters
  // would show a permanently empty list.
  const leader =
    leaderParam !== null && overview.data?.leaders.some((l) => l.id === leaderParam)
      ? leaderParam
      : null;

  // Each list is fetched only for its own view, one server page at a time, and
  // only once we know the viewer is an HBPR — otherwise a non-HBPR deep link
  // fires doomed 403 requests first.
  const evidence = useQuery({
    queryKey: ["tl-scorecard", "hbpr-evidence", year, leader, evidencePage, evidenceKind],
    queryFn: async (): Promise<HbprEvidencePage> => {
      const { data } = await tlScorecardService.listHbprEvidencePage({
        period_year: year,
        page: evidencePage,
        ...(leader !== null && { leader }),
        ...(evidenceKind && { kind: evidenceKind }),
      });
      return { count: data.count, rows: data.results };
    },
    enabled: view === "evidence" && overview.isSuccess,
    placeholderData: keepPreviousData,
  });

  const records = useQuery({
    queryKey: ["tl-scorecard", "hbpr-records", record, leader],
    queryFn: () => fetchHbprRecordsPage({ ...record, leader }),
    enabled: view === "records" && overview.isSuccess,
    placeholderData: keepPreviousData,
  });

  // Sidebar badges: one request for all six counts (leader + period scope).
  // Statuses are per-kind vocabularies, so the summary deliberately takes no
  // ?status= — the active kind's own page total stays the precise number.
  // ?q= does apply: like the TL badges, counts follow the search text.
  const recordsSummary = useQuery({
    queryKey: ["tl-scorecard", "hbpr-records-summary", leader, record.period, record.q],
    queryFn: async () =>
      (
        await tlScorecardService.getHbprRecordsSummary({
          ...(leader !== null && { leader }),
          ...(record.period && { period: record.period }),
          ...(record.q && { q: record.q }),
        })
      ).data,
    enabled: view === "records" && overview.isSuccess,
    placeholderData: keepPreviousData,
  });

  return { overview, evidence, records, recordsSummary, leader };
}
