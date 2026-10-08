import {
  Users,
  Building2,
  Briefcase,
  Clock,
  CalendarDays,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  UserPlus,
  ShieldCheck,
  Cpu,
  Gauge,
  ThumbsDown,
  UserCheck,
  UsersRound,
} from "lucide-react";

export interface WidgetConfig {
  id: string;
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  /** Hidden from the customize list and never rendered for non-superusers. */
  superuserOnly?: boolean;
}

/** Widgets fed by the single admin_overview request. */
export const OVERVIEW_WIDGET_IDS = [
  "org-headcount",
  "coverage-gaps",
  "pending-backlog",
  "approval-aging",
  "leave-utilization",
  "carryover-expiry",
  "period-close",
  "backup-status",
] as const;

/** Widgets fed by the single admin_trends request. */
export const TRENDS_WIDGET_IDS = [
  "ot-standby-trend",
  "leave-trend",
  "ot-by-client",
  "team-comparison",
  "who-is-out",
] as const;

/** Widgets fed by the single admin_people request. */
export const PEOPLE_WIDGET_IDS = [
  "role-distribution",
  "tech-distribution",
  "approver-sla",
  "rejection-analysis",
] as const;

/**
 * Available dashboard widgets configuration.
 * Centralized widget definitions for admin dashboard.
 *
 * Extracted from AdminDashboardPage to reduce complexity.
 */
export const AVAILABLE_WIDGETS: WidgetConfig[] = [
  { id: "total-users", title: "Total Users", description: "View total user count", icon: Users },
  {
    id: "total-teams",
    title: "Total Teams",
    description: "View total team count",
    icon: Building2,
  },
  {
    id: "pending-approvals",
    title: "Pending Approvals",
    description: "View pending requests",
    icon: AlertCircle,
  },
  {
    id: "overtime-hours",
    title: "Overtime Hours",
    description: "View overtime hours",
    icon: Clock,
  },
  {
    id: "hours-overview",
    title: "Hours Overview",
    description: "Overtime vs Standby chart",
    icon: TrendingUp,
  },
  {
    id: "approval-status",
    title: "Approval Status",
    description: "Request status breakdown",
    icon: CheckCircle,
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "Latest system events",
    icon: UserPlus,
  },
  {
    id: "org-headcount",
    title: "Headcount",
    description: "Active, inactive, new hires, never logged in",
    icon: Users,
  },
  {
    id: "coverage-gaps",
    title: "Coverage Gaps",
    description: "Teams, TLs and assignments that are missing",
    icon: AlertCircle,
  },
  {
    id: "pending-backlog",
    title: "Pending Backlog",
    description: "Pending overtime, standby and leave with totals",
    icon: Clock,
  },
  {
    id: "approval-aging",
    title: "Approval Aging",
    description: "How long pending requests have been waiting",
    icon: TrendingUp,
  },
  {
    id: "leave-utilization",
    title: "Leave Utilization",
    description: "Company-wide balance usage this year",
    icon: CalendarDays,
  },
  {
    id: "carryover-expiry",
    title: "Carryover Expiry",
    description: "Carry-over days about to expire",
    icon: CalendarDays,
  },
  {
    id: "period-close",
    title: "Period Close",
    description: "Which TLs have not closed last month",
    icon: CheckCircle,
  },
  {
    id: "backup-status",
    title: "Backup Status",
    description: "Age and size of the latest site backup (superuser)",
    icon: ShieldCheck,
    superuserOnly: true,
  },
  { id: "users", title: "Users Management", description: "Manage system users", icon: Users },
  { id: "teams", title: "Teams Management", description: "Manage teams", icon: Building2 },
  { id: "clients", title: "Clients", description: "View clients", icon: Briefcase },
  {
    id: "permissions",
    title: "Resource Access",
    description: "Manage permissions",
    icon: ShieldCheck,
  },
  {
    id: "calendar-mgmt",
    title: "Calendar Management",
    description: "Manage calendars",
    icon: CalendarDays,
  },
  { id: "reports", title: "Reports", description: "View reports", icon: TrendingUp },
  {
    id: "holiday-balances",
    title: "Leave Balances",
    description: "View leave balances",
    icon: CalendarDays,
  },
  {
    id: "ot-standby-trend",
    title: "Overtime & Standby Trend",
    description: "Approved hours per month, last 12 months",
    icon: TrendingUp,
  },
  {
    id: "leave-trend",
    title: "Leave Trend",
    description: "Approved vacation and sick business days per month",
    icon: CalendarDays,
  },
  {
    id: "ot-by-client",
    title: "Overtime by Client",
    description: "This month's approved overtime split by client",
    icon: Briefcase,
  },
  {
    id: "team-comparison",
    title: "Team Comparison",
    description: "Hours and leave per team, with overtime per person",
    icon: Building2,
  },
  {
    id: "who-is-out",
    title: "Who's Out Today",
    description: "People on leave or standby today",
    icon: UserCheck,
  },
  {
    id: "role-distribution",
    title: "Role Distribution",
    description: "Active users by role and employees without a TL",
    icon: UsersRound,
  },
  {
    id: "tech-distribution",
    title: "Tech Distribution",
    description: "Members per tech and level",
    icon: Cpu,
  },
  {
    id: "approver-sla",
    title: "Approver Speed",
    description: "Decision volume, approval rate and average time per approver",
    icon: Gauge,
  },
  {
    id: "rejection-analysis",
    title: "Rejection Analysis",
    description: "This month's rejections by type and top reasons",
    icon: ThumbsDown,
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
  "total-users": "overview",
  "total-teams": "overview",
  "org-headcount": "overview",
  "coverage-gaps": "overview",
  "pending-approvals": "approvals",
  "pending-backlog": "approvals",
  "approval-aging": "approvals",
  "approval-status": "approvals",
  "period-close": "approvals",
  "overtime-hours": "trends",
  "hours-overview": "trends",
  "leave-utilization": "leave",
  "carryover-expiry": "leave",
  "holiday-balances": "shortcuts",
  "recent-activity": "system",
  "backup-status": "system",
  "ot-standby-trend": "trends",
  "leave-trend": "trends",
  "ot-by-client": "trends",
  "team-comparison": "trends",
  "who-is-out": "trends",
  "role-distribution": "overview",
  "tech-distribution": "overview",
  "approver-sla": "approvals",
  "rejection-analysis": "approvals",
  users: "shortcuts",
  teams: "shortcuts",
  clients: "shortcuts",
  permissions: "shortcuts",
  "calendar-mgmt": "shortcuts",
  reports: "shortcuts",
};

/** Section a widget belongs to; undefined for ids that no longer exist. */
export const widgetSection = (widgetId: string): AdminDashboardSection | undefined =>
  WIDGET_SECTION[widgetId];
