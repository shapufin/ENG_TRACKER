import { useMemo } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { UserCell } from "@/components/admin/UserCell";
import { RowActions } from "@/components/ui/RowActions";
import { Pencil, KeyRound, Trash2, Shield } from "lucide-react";
import type { UserProfile } from "@/types";
import type { CRAccessRecord } from "./useUsersPage";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { toneSurfaceClass } from "@/components/ui/tone";

interface UseUserColumnsOptions {
  crActive?: boolean;
  crAccessUserIds?: Set<number>;
  crAccessByUserId?: Map<number, CRAccessRecord>;
  showCRScopeTeams?: boolean;
  /** Opens the record detail panel for a row. Omit to render the name as plain text. */
  onView?: (profile: UserProfile) => void;
  /** Opens the in-place Control Room grant dialog for a row. */
  onGrantCR?: (profile: UserProfile) => void;
}

const renderTLRoleCell = ({ profile }: { profile: UserProfile }) => {
  const roles = profile.user?.roles || [];
  const isIT = profile.is_italian_tl_role || roles.includes("italian_tl");
  const isAL = profile.is_albanian_tl_role || roles.includes("albanian_tl");
  const isHbpr = roles.includes("hbpr");
  const compact = isIT && isAL;
  const badges: ReactNode[] = [];
  if (isIT) {
    badges.push(
      <Badge
        key="it"
        variant="default"
        className={`${toneSurfaceClass.info} h-5 shrink-0 px-1.5 py-0 text-xs font-normal`}
      >
        {compact ? "IT" : "IT TL"}
      </Badge>
    );
  }
  if (isAL) {
    badges.push(
      <Badge
        key="al"
        variant="default"
        className={`${toneSurfaceClass.success} h-5 shrink-0 px-1.5 py-0 text-xs font-normal`}
      >
        {compact ? "AL" : "AL TL"}
      </Badge>
    );
  }
  if (isHbpr) {
    badges.push(
      <Badge
        key="hbpr"
        variant="default"
        className={`${toneSurfaceClass.accent} h-5 shrink-0 px-1.5 py-0 text-xs font-normal`}
      >
        HBPR
      </Badge>
    );
  }
  if (badges.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return <div className="flex flex-wrap gap-1">{badges}</div>;
};

const renderCRScopeTeamsCell = ({
  profile,
  accessByUserId,
}: {
  profile: UserProfile;
  accessByUserId: Map<number, CRAccessRecord>;
}) => {
  const scopes = accessByUserId.get(profile.user?.id)?.team_scopes ?? [];
  if (scopes.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <Badge key={scope.id} variant="secondary" className="text-xs">
          {scope.team_name}
        </Badge>
      ))}
    </div>
  );
};

const renderCRAccessCell = ({
  profile,
  accessUserIds,
}: {
  profile: UserProfile;
  accessUserIds: Set<number>;
}) =>
  accessUserIds.has(profile.user?.id) ? (
    <Badge
      variant="default"
      className="border-primary/30 bg-primary/15 text-foreground hover:bg-primary/20 h-5 shrink-0 px-1.5 py-0 text-xs"
      title="Control Room access granted"
    >
      CR
    </Badge>
  ) : (
    <span className="text-muted-foreground text-xs">—</span>
  );

export const useUserColumns = (
  onEdit: (profile: UserProfile) => void,
  onReset: (userId: number) => void,
  onDelete: (profile: UserProfile) => void,
  options: UseUserColumnsOptions = {}
): AppColumnDef<UserProfile>[] => {
  const {
    crActive = false,
    crAccessUserIds = new Set<number>(),
    crAccessByUserId = new Map<number, CRAccessRecord>(),
    showCRScopeTeams = false,
    onView,
    onGrantCR,
  } = options;

  return useMemo(() => {
    const base: AppColumnDef<UserProfile>[] = [
      {
        id: "username",
        accessorKey: "user.username",
        header: "Username",
        // Explicit widths throughout: TanStack's 150px default for an unsized
        // column is wider than several of these fields need, and 10 columns at
        // the default pushed the table ~400px past its 1440px viewport.
        // Flexible columns (badge lists, UserCell) truncate or wrap; the sum of
        // the visible columns is what keeps the table inside the viewport.
        size: 160,
        cell: ({ row }) => {
          const username = row.original.user?.username;
          const identity = <UserCell name={username} subtitle={row.original.user?.email} />;
          if (!onView) return identity;
          return (
            <button
              type="button"
              aria-label={`View details for ${username}`}
              onClick={(e) => {
                e.stopPropagation();
                onView(row.original);
              }}
              className="hover:text-primary focus-visible:ring-ring max-w-full rounded-md text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden motion-reduce:transition-none"
            >
              {identity}
            </button>
          );
        },
      },
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        size: 96,
        cell: ({ row }) =>
          row.original.code ? (
            <span className="font-mono text-xs">{row.original.code}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "email",
        accessorKey: "user.email",
        header: "Email",
        size: 200,
        cell: ({ row }) => (
          <span
            className="text-muted-foreground block max-w-[180px] truncate text-sm"
            title={row.original.user?.email}
          >
            {row.original.user?.email || <span className="opacity-50">—</span>}
          </span>
        ),
      },
      // Core "Team" column — shows all teams (M2M) as badges. Falls back to
      // team_name for backward compat if teams_detail is not populated.
      // Hidden for CR-only admins because they can't edit core team membership.
      ...(showCRScopeTeams
        ? []
        : [
            {
              id: "team",
              accessorKey: "team_name",
              header: "Teams",
              size: 130,
              cell: ({ row }: { row: { original: UserProfile } }) => {
                const teams = row.original.teams_detail;
                if (teams && teams.length > 0) {
                  return (
                    <div className="flex flex-wrap gap-1">
                      {teams.map((t) => (
                        <Badge key={t.id} variant="secondary" className="text-xs font-normal">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  );
                }
                return row.original.team_name || <span className="text-muted-foreground">—</span>;
              },
              enableSorting: false,
            } as AppColumnDef<UserProfile>,
          ]),
      // CR scope teams column — shown for ALL admins (full + CR-only) when
      // the control_room plugin is active. Full admins see both "Team"
      // (core) and "CR Teams" (scope); CR-only admins see only "CR Teams".
      ...(crActive
        ? [
            {
              id: "cr_teams",
              accessorKey: "cr_teams",
              header: "CR Teams",
              size: 96,
              cell: ({ row }: { row: { original: UserProfile } }) =>
                renderCRScopeTeamsCell({
                  profile: row.original,
                  accessByUserId: crAccessByUserId,
                }),
              enableSorting: false,
            } as AppColumnDef<UserProfile>,
          ]
        : []),
      // Independent technology assignments (descriptive metadata, not
      // permission/calendar scope). Always visible to all admins.
      {
        id: "techs",
        accessorKey: "techs",
        header: "Tech",
        size: 90,
        cell: ({ row }: { row: { original: UserProfile } }) => {
          const techs = row.original.techs_detail;
          if (techs && techs.length > 0) {
            return (
              <div className="flex flex-wrap gap-1">
                {techs.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className={`${toneSurfaceClass.accent} text-xs font-normal`}
                  >
                    {t.name}
                    {t.level && (
                      <span className="ml-1 font-semibold" title={`${t.name} — ${t.level.name}`}>
                        {t.level.code}
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            );
          }
          return <span className="text-muted-foreground text-xs">—</span>;
        },
        enableSorting: false,
      },
      {
        id: "hire_date",
        accessorKey: "hire_date",
        header: "Hire Date",
        size: 104,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{formatDateDDMMYYYY(row.original.hire_date)}</span>
        ),
      },
      {
        id: "tl_role",
        header: "TL Role",
        size: 90,
        cell: ({ row }) => renderTLRoleCell({ profile: row.original }),
      },
    ];

    // Plugin-aware CR badge column — only included when control_room is
    // active. Zero footprint (no column, no DOM) when plugin inactive.
    if (crActive) {
      base.push({
        id: "cr_access",
        header: "CR",
        size: 56,
        cell: ({ row }) =>
          renderCRAccessCell({ profile: row.original, accessUserIds: crAccessUserIds }),
      });
    }

    base.push(
      {
        id: "it_tl_assigned",
        accessorKey: "italian_tl_name",
        header: "IT TL (Assigned)",
        size: 145,
        cell: ({ row }) =>
          row.original.italian_tl_name ? (
            <span className="text-xs font-medium">{row.original.italian_tl_name}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "al_tl_assigned",
        accessorKey: "albanian_tl_name",
        header: "AL TL (Assigned)",
        size: 150,
        cell: ({ row }) =>
          row.original.albanian_tl_name ? (
            <span className="text-xs font-medium">{row.original.albanian_tl_name}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "actions",
        // No `size`: the column is sized by its icons (2026-10-10 refinement).
        // The previous reserved `size: 120` was ~4x the width the buttons need
        // and pushed IT/AL TL off-screen on a 1440px viewport.
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const username = row.original.user?.username;
          const userId = row.original.user?.id;
          return (
            <RowActions
              actions={[
                {
                  label: `Edit user ${username}`,
                  shortLabel: "Edit",
                  icon: Pencil,
                  onClick: () => onEdit(row.original),
                },
                {
                  label: `Reset password for ${username}`,
                  shortLabel: "Reset password",
                  icon: KeyRound,
                  tone: "warning" as const,
                  onClick: () => onReset(userId),
                },
                {
                  label: `Delete user ${username}`,
                  shortLabel: "Delete",
                  icon: Trash2,
                  tone: "danger" as const,
                  onClick: () => onDelete(row.original),
                },
                // Any existing record (even inactive) is managed on the CR page;
                // a second grant would be rejected as a duplicate.
                ...(crActive && onGrantCR && userId && !crAccessByUserId.has(userId)
                  ? [
                      {
                        label: `Grant Control Room access to ${username}`,
                        shortLabel: "Grant CR access",
                        icon: Shield,
                        onClick: () => onGrantCR(row.original),
                      },
                    ]
                  : []),
              ]}
            />
          );
        },
      }
    );

    return base;
  }, [
    onEdit,
    onReset,
    onDelete,
    crActive,
    crAccessUserIds,
    crAccessByUserId,
    showCRScopeTeams,
    onView,
    onGrantCR,
  ]);
};
