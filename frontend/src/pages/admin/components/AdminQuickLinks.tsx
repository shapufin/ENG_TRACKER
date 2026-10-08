import React from "react";
import { Link } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  Users,
  Building2,
  Briefcase,
  CalendarDays,
  TrendingUp,
  CheckCircle,
  Wallet,
} from "lucide-react";

const LINKS = [
  { title: "Users", icon: Users, to: "/admin/users" },
  { title: "Teams", icon: Building2, to: "/admin/teams" },
  { title: "Clients", icon: Briefcase, to: "/admin/clients" },
  { title: "Resource Access", icon: CheckCircle, to: "/admin/resource-access" },
  { title: "Calendar Mgmt", icon: CalendarDays, to: "/admin/calendars" },
  { title: "Reports", icon: TrendingUp, to: "/admin/reports" },
  { title: "Leave Balances", icon: Wallet, to: "/admin/leave-balances" },
];

/** The `shortcuts` widget: seven admin destinations as one compact row of links. */
export const AdminQuickLinks: React.FC = () => (
  <GlassCard data-chart-section="shortcuts">
    <nav aria-label="Admin shortcuts" className="flex flex-wrap gap-1 p-2">
      {LINKS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="text-foreground hover:bg-accent focus-visible:ring-focus inline-flex min-h-8 touch-manipulation items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden motion-reduce:transition-none"
        >
          <item.icon className="text-primary h-4 w-4 shrink-0" aria-hidden />
          {item.title}
        </Link>
      ))}
    </nav>
  </GlassCard>
);
