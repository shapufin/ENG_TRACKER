import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Users, Briefcase, User } from "lucide-react";
import type { DashboardType } from "@/context/permission-context-base";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

interface DashboardOption {
  id: DashboardType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const DASHBOARD_OPTIONS: Record<DashboardType, DashboardOption> = {
  employee: {
    id: "employee",
    label: "Personal Dashboard",
    icon: <User className="h-4 w-4" />,
    description: "Your personal overview",
  },
  team_leader: {
    id: "team_leader",
    label: "Team Leader Dashboard",
    icon: <Users className="h-4 w-4" />,
    description: "Team approvals and metrics",
  },
  hr: {
    id: "hr",
    label: "HR Dashboard",
    icon: <Shield className="h-4 w-4" />,
    description: "Company-wide overview",
  },
  admin: {
    id: "admin",
    label: "Admin Dashboard",
    icon: <Briefcase className="h-4 w-4" />,
    description: "System administration",
  },
};

interface RoleSwitcherProps {
  availableDashboards: DashboardType[];
  currentDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  availableDashboards,
  currentDashboard,
  onDashboardChange,
}) => {
  const [selected, setSelected] = useState<DashboardType>(currentDashboard);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(currentDashboard);
  }, [currentDashboard]);

  const handleChange = (value: string) => {
    const dashboard = value as DashboardType;
    setSelected(dashboard);
    onDashboardChange(dashboard);
  };

  if (availableDashboards.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-[200px]">
          <SelectValue placeholder="Select dashboard" />
        </SelectTrigger>
        <SelectContent>
          {availableDashboards.map((dashboard) => {
            const option = DASHBOARD_OPTIONS[dashboard];
            return (
              <SelectItem key={dashboard} value={dashboard}>
                <div className="flex items-center gap-2">
                  {option.icon}
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

interface RoleBadgesProps {
  isTeamLeader: boolean;
  isHR: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
}

export const RoleBadges: React.FC<RoleBadgesProps> = ({
  isTeamLeader,
  isHR,
  isAdmin,
  isSuperuser,
}) => {
  const roles: { label: string; tone: Tone }[] = [];

  if (isSuperuser) {
    roles.push({ label: "Superuser", tone: "danger" });
  } else if (isAdmin) {
    roles.push({ label: "Admin", tone: "danger" });
  }

  if (isHR) {
    roles.push({ label: "HR", tone: "neutral" });
  }

  if (isTeamLeader) {
    roles.push({ label: "Team Leader", tone: "accent" });
  }

  if (roles.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2" aria-label="Your roles">
      {roles.map((role) => (
        <span
          key={role.label}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            toneSurfaceClass[role.tone]
          )}
        >
          {role.label}
        </span>
      ))}
    </div>
  );
};
