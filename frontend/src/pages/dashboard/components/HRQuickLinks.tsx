import React from "react";
import { Link } from "react-router-dom";
import { Download, CalendarDays, Building2, Users, Wallet } from "lucide-react";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";

const LINKS = [
  {
    label: "Export Payroll",
    to: "/hr/payroll/runs",
    icon: Download,
    iconClass: "bg-tone-success-surface text-tone-success-text",
  },
  {
    label: "Company Holidays",
    to: "/hr/calendars",
    icon: CalendarDays,
    iconClass: "bg-tone-warning-surface text-tone-warning-text",
  },
  {
    label: "Department Settings",
    to: "/hr/teams",
    icon: Building2,
    iconClass: "bg-tone-accent-surface text-tone-accent-text",
  },
  {
    label: "Team Leader Assignment",
    to: "/hr/team-leaders",
    icon: Users,
    iconClass: "bg-primary/10 text-primary",
  },
  {
    label: "Assign Wages",
    to: "/hr/payroll/wages",
    icon: Wallet,
    iconClass: "bg-tone-success-surface text-tone-success-text",
  },
];

export const HRQuickLinks: React.FC = () => (
  <DashboardSectionShell
    title="Management Quick Links"
    subtitle="Jump to common HR workflows"
    bodyClassName="grid grid-cols-2 gap-4 lg:grid-cols-4"
  >
    {LINKS.map((link) => (
      <Link
        key={link.to}
        to={link.to}
        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/[0.02] p-5 text-center transition hover:border-primary/30 hover:bg-muted/40"
      >
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${link.iconClass}`}>
          <link.icon className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium">{link.label}</span>
      </Link>
    ))}
  </DashboardSectionShell>
);
