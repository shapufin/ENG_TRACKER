import React, { useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { DataTableActions } from "./DataTableActions";
import { ChevronRight, ChevronDown, Share2, Users } from "lucide-react";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { UserProfile } from "@/types";
import type { TeamNode } from "@/lib/teamTree";

const SEARCH_COLUMNS = ["name", "code", "description"];

interface TeamDataTableProps {
  data: TeamNode[];
  profiles: UserProfile[];
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (team: TeamNode) => void;
  onDelete?: (team: TeamNode) => void;
  hoveredPath: Set<number>;
  onRowMouseEnter: (team: TeamNode) => void;
  onRowMouseLeave: () => void;
  /** Header strip inside the table card (e.g. facet filters), not its own surface. */
  header?: React.ReactNode;
}

export const TeamDataTable: React.FC<TeamDataTableProps> = ({
  data,
  profiles,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  hoveredPath,
  onRowMouseEnter,
  onRowMouseLeave,
  header,
}) => {
  const hasChildren = useCallback(
    (id: number) => data.find((t) => t.id === id)?.children.length || 0 > 0,
    [data]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }: { row: { original: TeamNode } }) => {
          const team = row.original;
          return (
            <div
              className="flex items-center gap-1"
              style={{ paddingLeft: `${team.depth * 24}px` }}
            >
              {hasChildren(team.id) ? (
                <button
                  type="button"
                  aria-expanded={expanded.has(team.id)}
                  aria-label={
                    expanded.has(team.id) ? `Collapse ${team.name}` : `Expand ${team.name}`
                  }
                  onClick={() => onToggleExpand(team.id)}
                  className="hover:bg-muted flex h-5 w-5 items-center justify-center rounded"
                >
                  {expanded.has(team.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="inline-block h-5 w-5" />
              )}
              <span className="font-medium whitespace-nowrap">{team.name}</span>
            </div>
          );
        },
      },
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        cell: ({ row }: { row: { original: TeamNode } }) => (
          <Badge variant="outline" className="font-mono text-xs font-normal">
            {row.original.code}
          </Badge>
        ),
      },
      {
        id: "description",
        accessorKey: "description",
        header: "Description",
        cell: ({ row }: { row: { original: TeamNode } }) =>
          row.original.description ? (
            <span
              className="text-muted-foreground block max-w-xs truncate text-xs"
              title={row.original.description}
            >
              {row.original.description}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "team_leader",
        accessorKey: "team_leader",
        header: "Leader",
        // fallow-ignore-next-line complexity
        cell: ({ row }: { row: { original: TeamNode } }) => {
          const team = row.original;
          if (!team.team_leader) return <span className="text-muted-foreground">—</span>;
          const profile = profiles.find((p: UserProfile) => p.user.id === team.team_leader!.id);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium whitespace-nowrap">
                {team.team_leader.first_name} {team.team_leader.last_name}
              </span>
              {profile?.italian_tl && (
                <Badge
                  variant="default"
                  className={`${toneSurfaceClass.info} h-5 shrink-0 px-1.5 py-0 text-xs font-normal whitespace-nowrap`}
                >
                  Italian TL
                </Badge>
              )}
              {profile?.albanian_tl && (
                <Badge
                  variant="default"
                  className={`${toneSurfaceClass.success} h-5 shrink-0 px-1.5 py-0 text-xs font-normal whitespace-nowrap`}
                >
                  Albanian TL
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "members_count",
        accessorKey: "members_count",
        header: "Members",
        cell: ({ row }: { row: { original: TeamNode } }) => (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-medium tabular-nums">
            <Users className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
            {row.original.members_count ?? 0}
          </span>
        ),
      },
      {
        id: "calendar_group",
        accessorKey: "calendar_group",
        header: "Calendar Group",
        cell: ({ row }: { row: { original: TeamNode } }) =>
          row.original.calendar_group ? (
            <Badge
              variant="secondary"
              className="inline-flex items-center gap-1 font-mono text-xs font-normal"
            >
              <Share2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {row.original.calendar_group}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "sub_teams_count",
        accessorKey: "sub_teams_count",
        header: "Sub-teams",
        cell: ({ row }: { row: { original: TeamNode } }) => (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.sub_teams_count ?? 0}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }: { row: { original: TeamNode } }) => (
          <DataTableActions
            item={row.original}
            itemLabel={row.original.name}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [profiles, expanded, onToggleExpand, onEdit, onDelete, hasChildren]
  );

  return (
    <GlassCard delay={0} className="p-4">
      {header && <div className="mb-4">{header}</div>}
      <DataTable
        columns={columns}
        data={data}
        searchColumn={SEARCH_COLUMNS}
        searchPlaceholder="Search teams by name, code, description..."
        enableColumnVisibility
        storageKey="table-visibility-teams-page"
        pageSize={1000}
        getRowClassName={(team: TeamNode) =>
          hoveredPath.has(team.id)
            ? "bg-muted/60 cursor-pointer"
            : "hover:bg-table-hover cursor-pointer"
        }
        onRowMouseEnter={(team: TeamNode) => onRowMouseEnter(team)}
        onRowMouseLeave={onRowMouseLeave}
      />
    </GlassCard>
  );
};
