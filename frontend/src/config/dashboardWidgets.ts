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
}

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
    title: "Holiday Balances",
    description: "View holiday balances",
    icon: CalendarDays,
  },
];
