import React, { useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { RowActions } from "@/components/ui/RowActions";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  ChevronDown,
  Database,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import type { TeamNode } from "@/lib/teamTree";

const SEARCH_COLUMNS = ["name", "code", "description", "italian_tl", "albanian_tl"];

/** IT/AL TL derived from the team's members; sortable by the TL's name. */
const tlColumn = (side: "italian_tl" | "albanian_tl", header: string) => ({
  id: side,
  header,
  accessorFn: (team: TeamNode) => {
    const tl = team[side];
    return tl ? `${tl.first_name} ${tl.last_name}`.trim() || tl.username : "";
  },
  cell: ({ row }: { row: { original: TeamNode } }) => {
    const tl = row.original[side];
    if (!tl) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="font-medium whitespace-nowrap">
        {`${tl.first_name} ${tl.last_name}`.trim() || tl.username}
      </span>
    );
  },
});

interface TeamDataTableProps {
  data: TeamNode[];
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (team: TeamNode) => void;
  onDelete?: (team: TeamNode) => void;
  onArchive?: (team: TeamNode) => void;
  onUnarchive?: (team: TeamNode) => void;
  onManageArchived?: (team: TeamNode) => void;
  hoveredPath: Set<number>;
  onRowMouseEnter: (team: TeamNode) => void;
  onRowMouseLeave: () => void;
  /** Header strip inside the table card (e.g. facet filters), not its own surface. */
  header?: React.ReactNode;
  /** Shown when no row matches (filter-aware wording comes from the page). */
  emptyMessage?: string;
}

export const TeamDataTable: React.FC<TeamDataTableProps> = ({
  data,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onManageArchived,
  hoveredPath,
  onRowMouseEnter,
  onRowMouseLeave,
  header,
  emptyMessage,
}) => {
  const hasChildren = useCallback(
    (id: number) => data.find((t) => t.id === id)?.children.length || 0 > 0,
    [data]
  );

  const hasDescriptions = data.some((team) => team.description);

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
              {team.is_active === false && (
                <Badge variant="secondary" className="ml-2 text-xs font-normal">
                  Archived
                </Badge>
              )}
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
      tlColumn("italian_tl", "IT TL"),
      tlColumn("albanian_tl", "AL TL"),
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
        cell: ({ row }: { row: { original: TeamNode } }) => {
          const team = row.original;
          const archived = team.is_active === false;
          return (
            <RowActions
              actions={[
                {
                  label: `Edit ${team.name}`,
                  shortLabel: "Edit",
                  icon: Pencil,
                  onClick: () => onEdit(team),
                },
                ...(archived && onUnarchive
                  ? [
                      {
                        label: `Restore ${team.name}`,
                        shortLabel: "Restore",
                        icon: ArchiveRestore,
                        tone: "success" as const,
                        onClick: () => onUnarchive(team),
                      },
                    ]
                  : []),
                ...(archived && onManageArchived
                  ? [
                      {
                        label: `Archived data of ${team.name}`,
                        shortLabel: "Data",
                        icon: Database,
                        onClick: () => onManageArchived(team),
                      },
                    ]
                  : []),
                ...(!archived && onArchive
                  ? [
                      {
                        label: `Archive ${team.name}`,
                        shortLabel: "Archive",
                        icon: Archive,
                        tone: "warning" as const,
                        // The server says why in the list itself, so the admin sees it before clicking.
                        disabled: Boolean(team.archive_blockers?.length),
                        disabledReason: team.archive_blockers?.join(" "),
                        onClick: () => onArchive(team),
                      },
                    ]
                  : []),
                ...(!archived && onDelete
                  ? [
                      {
                        label: `Delete ${team.name}`,
                        shortLabel: "Delete",
                        icon: Trash2,
                        tone: "danger" as const,
                        onClick: () => onDelete(team),
                      },
                    ]
                  : []),
              ]}
            />
          );
        },
      },
    ],
    [
      expanded,
      onToggleExpand,
      onEdit,
      onDelete,
      onArchive,
      onUnarchive,
      onManageArchived,
      hasChildren,
    ]
  );

  return (
    <GlassCard delay={0} className="p-4">
      {header && <div className="mb-4">{header}</div>}
      <DataTable
        columns={columns}
        data={data}
        searchColumn={SEARCH_COLUMNS}
        emptyMessage={emptyMessage}
        searchPlaceholder="Search teams by name, code, TL..."
        enableColumnVisibility
        storageKey="table-visibility-teams-page"
        // An all-empty Description column pushes Actions off a 1440px card; it appears as soon as one team has text.
        defaultColumnVisibility={{ description: hasDescriptions }}
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
