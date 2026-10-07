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
];
