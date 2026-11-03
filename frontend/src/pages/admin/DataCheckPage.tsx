import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, CheckCircle2, UserX, Users, Shuffle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconWell } from "@/components/ui/IconWell";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/StatCard";
import { SearchField } from "@/components/ui/SearchField";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { userService } from "@/services/userService";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { SuggestedTeamMoves } from "./components/SuggestedTeamMoves";

type DataCheckTab = "all" | "users" | "leaders" | "empty" | "clients" | "suggestions";

interface CheckSectionProps {
  title: string;
  hint: string;
  to: string;
  icon: React.ElementType;
  rows: Array<{ id: number; label: string; detail?: string; linkTo?: string }>;
  searchQuery?: string;
  fullWidth?: boolean;
}

const CheckSection: React.FC<CheckSectionProps> = ({
  title,
  hint,
  to,
  icon: Icon,
  rows,
  searchQuery = "",
  fullWidth = false,
}) => {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) => r.label.toLowerCase().includes(q) || (r.detail && r.detail.toLowerCase().includes(q))
      )
    : rows;

  return (
    <GlassCard className={cn("flex flex-col p-4", fullWidth && "lg:col-span-2")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconWell tone={rows.length === 0 ? "success" : "warning"}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </IconWell>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {title}
              <Badge variant={rows.length === 0 ? "success" : "warning"} className="tabular-nums">
                ({rows.length})
              </Badge>
            </h2>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </div>
        </div>
        <Link
          to={to}
          aria-label={`Open page: ${title}`}
          className="text-primary inline-flex min-h-6 items-center text-xs font-medium whitespace-nowrap hover:underline"
        >
          Open page
        </Link>
      </div>

      {q && rows.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Showing {filtered.length} of {rows.length}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-tone-success-text mt-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Nothing to fix.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs italic">
          No records match "{searchQuery}".
        </p>
      ) : (
        <ul className="divide-border/60 mt-3 max-h-72 divide-y overflow-y-auto pr-1 text-sm">
          {filtered.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              {row.linkTo ? (
                <Link
                  to={row.linkTo}
                  className="hover:text-primary font-medium transition-colors hover:underline"
                >
                  {row.label}
                </Link>
              ) : (
                <span>{row.label}</span>
              )}
              {row.detail && <span className="text-muted-foreground text-xs">{row.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
};

export const DataCheckPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DataCheckTab>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "orphans"],
    queryFn: () => userService.getOrphans(),
    refetchOnWindowFocus: false,
  });

  // A failed suggestions read only hides that section: the checks above it still stand.
  const {
    data: suggestions = [],
    isSuccess: suggestionsLoaded,
    isError: suggestionsError,
  } = useQuery({
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

  const showSuggestions =
    (activeTab === "all" || activeTab === "suggestions") && suggestions.length > 0;
  const showUsers = activeTab === "all" || activeTab === "users";
  const showLeaders = activeTab === "all" || activeTab === "leaders";
  const showEmpty = activeTab === "all" || activeTab === "empty";
  const showClients = activeTab === "all" || activeTab === "clients";

  return (
    <PageShell title="Data check">
      {total === 0 && suggestionsLoaded && suggestions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title="Everything is linked"
          description="Every active person has a team, every team has a leader and members, and every client has someone assigned."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Executive KPI Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="People without team"
              value={data.users_without_team.length}
              icon={UserX}
              iconTone={data.users_without_team.length === 0 ? "success" : "warning"}
              valueColorClass={
                data.users_without_team.length === 0
                  ? "text-tone-success-text"
                  : "text-tone-warning-text"
              }
              onClick={() => setActiveTab(activeTab === "users" ? "all" : "users")}
              pressed={activeTab === "users"}
            />
            <StatCard
              label="Teams without leader"
              value={data.teams_without_leader.length}
              icon={Building2}
              iconTone={data.teams_without_leader.length === 0 ? "success" : "warning"}
              valueColorClass={
                data.teams_without_leader.length === 0
                  ? "text-tone-success-text"
                  : "text-tone-warning-text"
              }
              onClick={() => setActiveTab(activeTab === "leaders" ? "all" : "leaders")}
              pressed={activeTab === "leaders"}
            />
            <StatCard
              label="Empty teams"
              value={data.empty_teams.length}
              icon={Users}
              iconTone={data.empty_teams.length === 0 ? "success" : "warning"}
              valueColorClass={
                data.empty_teams.length === 0 ? "text-tone-success-text" : "text-tone-warning-text"
              }
              onClick={() => setActiveTab(activeTab === "empty" ? "all" : "empty")}
              pressed={activeTab === "empty"}
            />
            <StatCard
              label="Clients nobody works on"
              value={data.unassigned_clients.length}
              icon={Briefcase}
              iconTone={data.unassigned_clients.length === 0 ? "success" : "warning"}
              valueColorClass={
                data.unassigned_clients.length === 0
                  ? "text-tone-success-text"
                  : "text-tone-warning-text"
              }
              onClick={() => setActiveTab(activeTab === "clients" ? "all" : "clients")}
              pressed={activeTab === "clients"}
            />
            <StatCard
              label="Team suggestions"
              value={suggestions.length}
              icon={Shuffle}
              iconTone="accent"
              valueColorClass="text-primary"
              onClick={() => setActiveTab(activeTab === "suggestions" ? "all" : "suggestions")}
              pressed={activeTab === "suggestions"}
            />
          </div>

          {/* Search & Category Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search checks & suggestions…"
                aria-label="Search data check items"
                onClear={() => setSearch("")}
                controlSize="sm"
              />
            </div>
            <FilterChipRow
              label="Filter view"
              selected={[activeTab]}
              onToggle={(val) => setActiveTab(val as DataCheckTab)}
              options={[
                { value: "all", label: "All checks", count: total + suggestions.length },
                { value: "users", label: "People", count: data.users_without_team.length },
                {
                  value: "leaders",
                  label: "Missing leaders",
                  count: data.teams_without_leader.length,
                },
                { value: "empty", label: "Empty teams", count: data.empty_teams.length },
                {
                  value: "clients",
                  label: "Unassigned clients",
                  count: data.unassigned_clients.length,
                },
                ...(suggestions.length > 0
                  ? [{ value: "suggestions", label: "Suggestions", count: suggestions.length }]
                  : []),
              ]}
            />
          </div>

          {/* Error Banner for suggestions */}
          {suggestionsError && (
            <p className="text-muted-foreground text-xs">Team suggestions could not be loaded.</p>
          )}

          {/* Main Grid of Checks and Suggestions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {showSuggestions && (
              <div className="lg:col-span-2">
                <SuggestedTeamMoves rows={suggestions} externalSearch={search} />
              </div>
            )}
            {showUsers && (
              <CheckSection
                title="People without a team"
                hint="Active employees in no active team. They are missing from every team calendar."
                to="/admin/users"
                icon={UserX}
                searchQuery={search}
                fullWidth={activeTab === "users"}
                rows={data.users_without_team.map((u) => ({
                  id: u.id,
                  label: u.full_name,
                  detail: u.username,
                  linkTo: `/admin/users?q=${encodeURIComponent(u.username)}`,
                }))}
              />
            )}
            {showLeaders && (
              <CheckSection
                title="Teams without a leader"
                hint="Nobody approves their leave, overtime or standby."
                to="/admin/teams"
                icon={Building2}
                searchQuery={search}
                fullWidth={activeTab === "leaders"}
                rows={data.teams_without_leader.map((t) => ({
                  id: t.id,
                  label: `${t.name} (${t.code})`,
                  detail: plural(t.members_count, "member"),
                  linkTo: `/admin/teams?q=${encodeURIComponent(t.code)}`,
                }))}
              />
            )}
            {showEmpty && (
              <CheckSection
                title="Empty teams"
                hint="Active teams with no members. Archive them if they are retired."
                to="/admin/teams"
                icon={Users}
                searchQuery={search}
                fullWidth={activeTab === "empty"}
                rows={data.empty_teams.map((t) => ({
                  id: t.id,
                  label: `${t.name} (${t.code})`,
                  linkTo: `/admin/teams?q=${encodeURIComponent(t.code)}`,
                }))}
              />
            )}
            {showClients && (
              <CheckSection
                title="Clients nobody works on"
                hint="Active clients with no assigned person. Team leaders assign clients from Settings → Client Assignment."
                to="/admin/clients"
                icon={Briefcase}
                searchQuery={search}
                fullWidth={activeTab === "clients"}
                rows={data.unassigned_clients.map((c) => ({
                  id: c.id,
                  label: `${c.name} (${c.code})`,
                  linkTo: `/admin/clients?q=${encodeURIComponent(c.code)}`,
                }))}
              />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
};
