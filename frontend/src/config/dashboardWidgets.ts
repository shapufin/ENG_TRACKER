import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle,
  Gauge,
  ShieldCheck,
  ThumbsDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";

interface WidgetConfig {
  id: string;
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  /** Hidden from the customize list and never rendered for non-superusers. */
  superuserOnly?: boolean;
  /** Default footprint on the 12-column grid (width in columns, height in rows). */
  defaultSize: { w: number; h: number };
  /** Smallest footprint the grid may shrink this widget to. */
  minW: number;
  minH: number;
}

/** Widgets fed by the single admin_overview request. */
export const OVERVIEW_WIDGET_IDS = [
  "kpi-strip",
  "coverage-gaps",
  "period-close",
  "backup-status",
] as const;

/** Widgets fed by the single admin_trends request. */
export const TRENDS_WIDGET_IDS = [
  "hours-trend",
  "leave-trend",
  "ot-by-client",
  "team-comparison",
  "who-is-out",
] as const;

/** Widgets fed by the single admin_people request. */
export const PEOPLE_WIDGET_IDS = ["people-mix", "rejection-analysis"] as const;

/**
 * Available dashboard widgets (the ids are the persisted contract; the old
 * per-metric ids are mapped onto these by `migrateLayout`).
 * `approval-queue` and `shortcuts` need no section request of their own: the first
 * reads each tab's data lazily, the second is static links.
 */
export const AVAILABLE_WIDGETS: WidgetConfig[] = [
  {
    id: "kpi-strip",
    title: "Key Figures",
    description: "Users, teams, pending, overtime, leave utilization and carryover at a glance",
    icon: Gauge,
    defaultSize: { w: 12, h: 2 },
    minW: 6,
    minH: 2,
  },
  {
    id: "coverage-gaps",
    title: "Coverage Gaps",
    description: "Missing teams, TLs and assignments, plus new hires and never-logged-in users",
    icon: AlertCircle,
    defaultSize: { w: 4, h: 4 },
    minW: 3,
    minH: 3,
  },
  {
    id: "people-mix",
    title: "People Mix",
    description: "Active users by role and members per tech and level",
    icon: UsersRound,
    defaultSize: { w: 4, h: 5 },
    minW: 3,
    minH: 3,
  },
  {
    id: "approval-queue",
    title: "Approval Queue",
    description: "Request status, how long requests wait, and approver speed",
    icon: CheckCircle,
    defaultSize: { w: 6, h: 5 },
    minW: 4,
    minH: 4,
  },
  {
    id: "rejection-analysis",
    title: "Rejection Analysis",
    description: "This month's rejections by type and top reasons",
    icon: ThumbsDown,
    defaultSize: { w: 6, h: 5 },
    minW: 3,
    minH: 3,
  },
  {
    id: "hours-trend",
    title: "Hours",
    description: "Overtime vs standby this month and the monthly trend",
    icon: TrendingUp,
    defaultSize: { w: 8, h: 5 },
    minW: 4,
    minH: 4,
  },
  {
    id: "ot-by-client",
    title: "Overtime by Client",
    description: "This month's approved overtime split by client",
    icon: Briefcase,
    defaultSize: { w: 4, h: 5 },
    minW: 3,
    minH: 3,
  },
  {
    id: "team-comparison",
    title: "Team Comparison",
    description: "Hours and leave per team, with overtime per person",
    icon: Building2,
    defaultSize: { w: 6, h: 5 },
    minW: 4,
    minH: 3,
  },
  {
    id: "leave-trend",
    title: "Leave Trend",
    description: "Approved vacation and sick business days per month",
    icon: CalendarDays,
    defaultSize: { w: 6, h: 5 },
    minW: 4,
    minH: 3,
  },
  {
    id: "who-is-out",
    title: "Who's Out Today",
    description: "People on leave or standby today",
    icon: UserCheck,
    defaultSize: { w: 4, h: 5 },
    minW: 3,
    minH: 3,
  },
  {
    id: "period-close",
    title: "Period Close",
    description: "Which TLs have not closed last month",
    icon: CheckCircle,
    defaultSize: { w: 4, h: 3 },
    minW: 3,
    minH: 2,
  },
  {
    id: "backup-status",
    title: "Backup Status",
    description: "Age and size of the latest site backup (superuser)",
    icon: ShieldCheck,
    superuserOnly: true,
    defaultSize: { w: 4, h: 3 },
    minW: 3,
    minH: 2,
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "Latest system events",
    icon: UserPlus,
    defaultSize: { w: 4, h: 5 },
    minW: 3,
    minH: 3,
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    description: "Users, teams, clients, access, calendars, reports and leave balances",
    icon: ArrowUpRight,
    defaultSize: { w: 12, h: 1 },
    minW: 6,
    minH: 1,
  },
];

export type AdminDashboardSection =
  | "overview"
  | "approvals"
  | "trends"
  | "leave"
  | "system"
  | "shortcuts";

/** Tab order on the admin dashboard; also the group order in the customize modal. */
export const ADMIN_DASHBOARD_SECTIONS: { id: AdminDashboardSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "approvals", label: "Approvals" },
  { id: "trends", label: "Hours & Trends" },
  { id: "leave", label: "Leave" },
  { id: "system", label: "System" },
  { id: "shortcuts", label: "Shortcuts" },
];

const WIDGET_SECTION: Record<string, AdminDashboardSection> = {
  "kpi-strip": "overview",
  "coverage-gaps": "overview",
  "people-mix": "overview",
  "approval-queue": "approvals",
  "rejection-analysis": "approvals",
  "hours-trend": "trends",
  "ot-by-client": "trends",
  "team-comparison": "trends",
  "leave-trend": "leave",
  "who-is-out": "leave",
  "period-close": "system",
  "backup-status": "system",
  "recent-activity": "system",
  shortcuts: "shortcuts",
};

/** Section a widget belongs to; undefined for ids that no longer exist. */
export const widgetSection = (widgetId: string): AdminDashboardSection | undefined =>
  WIDGET_SECTION[widgetId];
