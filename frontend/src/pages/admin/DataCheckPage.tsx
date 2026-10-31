import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, CheckCircle2, UserX, Users } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { userService } from "@/services/userService";
import { SuggestedTeamMoves } from "./components/SuggestedTeamMoves";

interface CheckSectionProps {
  title: string;
  hint: string;
  to: string;
  icon: React.ElementType;
  rows: Array<{ id: number; label: string; detail?: string }>;
}

const CheckSection: React.FC<CheckSectionProps> = ({ title, hint, to, icon: Icon, rows }) => (
  <GlassCard className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Icon className="text-muted-foreground mt-0.5 h-4 w-4" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">
            {title} <span className="text-muted-foreground tabular-nums">({rows.length})</span>
          </h2>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
      </div>
      <Link to={to} className="text-primary inline-flex min-h-6 items-center text-xs font-medium">
        Open page
      </Link>
    </div>
    {rows.length === 0 ? (
      <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Nothing to fix.
      </p>
    ) : (
      <ul className="divide-border/60 mt-3 divide-y text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <span>{row.label}</span>
            {row.detail && <span className="text-muted-foreground text-xs">{row.detail}</span>}
          </li>
        ))}
      </ul>
    )}
  </GlassCard>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const DataCheckPage: React.FC = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "orphans"],
    queryFn: () => userService.getOrphans(),
    refetchOnWindowFocus: false,
  });

  // A failed suggestions read only hides that section: the checks above it still stand.
  const { data: suggestions = [] } = useQuery({
    queryKey: ["admin", "team-suggestions"],
    queryFn: () => userService.getTeamSuggestions(),
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (isError || !data) {
    return <ErrorCard title="Failed to run the data check" onRetry={() => void refetch()} />;
  }

  const total =
    data.users_without_team.length +
    data.teams_without_leader.length +
    data.empty_teams.length +
    data.unassigned_clients.length;

  return (
    <PageShell title="Data check">
      {total === 0 && suggestions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title="Everything is linked"
          description="Every active person has a team, every team has a leader and members, and every client has someone assigned."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {suggestions.length > 0 && (
            <div className="lg:col-span-2">
              <SuggestedTeamMoves rows={suggestions} />
            </div>
          )}
          <CheckSection
            title="People without a team"
            hint="Active employees in no active team. They are missing from every team calendar."
            to="/admin/users"
            icon={UserX}
            rows={data.users_without_team.map((u) => ({
              id: u.id,
              label: u.full_name,
              detail: u.username,
            }))}
          />
          <CheckSection
            title="Teams without a leader"
            hint="Nobody approves their leave, overtime or standby."
            to="/admin/teams"
            icon={Building2}
            rows={data.teams_without_leader.map((t) => ({
              id: t.id,
              label: `${t.name} (${t.code})`,
              detail: plural(t.members_count, "member"),
            }))}
          />
          <CheckSection
            title="Empty teams"
            hint="Active teams with no members. Archive them if they are retired."
            to="/admin/teams"
            icon={Users}
            rows={data.empty_teams.map((t) => ({ id: t.id, label: `${t.name} (${t.code})` }))}
          />
          <CheckSection
            title="Clients nobody works on"
            hint="Active clients with no assigned person."
            to="/admin/clients"
            icon={Briefcase}
            rows={data.unassigned_clients.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
          />
        </div>
      )}
    </PageShell>
  );
};
