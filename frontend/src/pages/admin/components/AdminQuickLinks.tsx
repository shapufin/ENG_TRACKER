import React from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  Users,
  Building2,
  Briefcase,
  CalendarDays,
  TrendingUp,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const LINKS = [
  {
    id: "users",
    title: "Users",
    desc: "Manage users, profiles, bulk import",
    icon: Users,
    color: "primary" as const,
    to: "/admin/users",
  },
  {
    id: "teams",
    title: "Teams",
    desc: "Manage teams, hierarchy, assignments",
    icon: Building2,
    color: "success" as const,
    to: "/admin/teams",
  },
  {
    id: "clients",
    title: "Clients",
    desc: "Manage client codes and active status",
    icon: Briefcase,
    color: "warning" as const,
    to: "/admin/clients",
  },
  {
    id: "permissions",
    title: "Resource Access",
    desc: "Manage groups, roles, assignments",
    icon: CheckCircle,
    color: "primary" as const,
    to: "/admin/resource-access",
  },
  {
    id: "calendar-mgmt",
    title: "Calendar Mgmt",
    desc: "Assign teams to shared calendar groups",
    icon: CalendarDays,
    color: "success" as const,
    to: "/admin/calendars",
  },
  {
    id: "reports",
    title: "Reports",
    desc: "Generate overtime, standby, vacation reports",
    icon: TrendingUp,
    color: "success" as const,
    to: "/admin/reports",
  },
  {
    id: "holiday-balances",
    title: "Holiday Balances",
    desc: "Adjust vacation leave balances",
    icon: CalendarDays,
    color: "warning" as const,
    to: "/admin/holiday-balances",
  },
];

interface AdminQuickLinksProps {
  isWidgetActive: (id: string) => boolean;
}

export const AdminQuickLinks: React.FC<AdminQuickLinksProps> = ({ isWidgetActive }) => {
  const navigate = useNavigate();

  return (
    // Auto-fit (rather than a fixed 2/3-column breakpoint) so a 7-item set
    // never strands a lone orphan card at tablet widths — each row reflows
    // to fill the available width instead of leaving a dangling gap.
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
      {LINKS.filter((item) => isWidgetActive(item.id)).map((item) => (
        <GlassCard
          key={item.to}
          delay={0.3}
          isHoverLift
          glow={item.color}
          className="group cursor-pointer active:scale-[0.98]"
          onClick={() => navigate(item.to)}
        >
          <div className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-transparent">
              <item.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </GlassCard>
      ))}
    </div>
  );
};
