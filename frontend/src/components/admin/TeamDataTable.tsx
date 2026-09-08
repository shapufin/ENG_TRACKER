import React, { useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { DataTableActions } from "./DataTableActions";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { UserProfile } from "@/types";
import type { TeamNode } from "@/lib/teamTree";

interface TeamDataTableProps {
  data: TeamNode[];
  profiles: UserProfile[];
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (team: TeamNode) => void;
  onDelete: (team: TeamNode) => void;
  hoveredPath: Set<number>;
  onRowMouseEnter: (team: TeamNode) => void;
  onRowMouseLeave: () => void;
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
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
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
              <span className="font-medium">{team.name}</span>
            </div>
          );
        },
      },
      { id: "code", accessorKey: "code", header: "Code" },
      { id: "description", accessorKey: "description", header: "Description" },
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
            <div className="flex items-center gap-1">
              <span>
                {team.team_leader.first_name} {team.team_leader.last_name}
              </span>
              {profile?.italian_tl && <Badge variant="secondary">Italian TL</Badge>}
              {profile?.albanian_tl && <Badge variant="outline">Albanian TL</Badge>}
            </div>
          );
        },
      },
      { id: "members_count", accessorKey: "members_count", header: "Members" },
      {
        id: "calendar_group",
        accessorKey: "calendar_group",
        header: "Calendar Group",
        cell: ({ row }: { row: { original: TeamNode } }) =>
          row.original.calendar_group || <span className="text-muted-foreground">—</span>,
      },
      { id: "sub_teams_count", accessorKey: "sub_teams_count", header: "Sub-teams" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }: { row: { original: TeamNode } }) => (
          <DataTableActions item={row.original} onEdit={onEdit} onDelete={onDelete} />
        ),
      },
    ],
    [profiles, expanded, onToggleExpand, onEdit, onDelete, hasChildren]
  );

  return (
    <GlassCard delay={0} className="p-4">
      <DataTable
        columns={columns}
        data={data}
        enableColumnVisibility
        storageKey="table-visibility-teams-page"
        pageSize={1000}
        getRowClassName={(team: TeamNode) =>
          hoveredPath.has(team.id)
            ? "bg-muted/60 cursor-pointer"
            : "hover:bg-muted/30 cursor-pointer"
        }
        onRowMouseEnter={(team: TeamNode) => onRowMouseEnter(team)}
        onRowMouseLeave={onRowMouseLeave}
      />
    </GlassCard>
  );
};
