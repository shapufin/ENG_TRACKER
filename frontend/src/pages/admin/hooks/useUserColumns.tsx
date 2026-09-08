import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, KeyRound, Trash2, Shield } from "lucide-react";
import type { UserProfile } from "@/types";
import type { ControlRoomAccess } from "@/plugins/control_room/types";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";

interface UseUserColumnsOptions {
  crActive?: boolean;
  crAccessUserIds?: Set<number>;
  crAccessByUserId?: Map<number, ControlRoomAccess>;
  showCRScopeTeams?: boolean;
}

const renderTLRoleCell = ({ profile }: { profile: UserProfile }) => {
  const roles = profile.user?.roles || [];
  const isIT = profile.is_italian_tl_role || roles.includes("italian_tl");
  const isAL = profile.is_albanian_tl_role || roles.includes("albanian_tl");
  if (isIT && isAL) {
    return (
      <div className="flex gap-1">
        <Badge
          variant="default"
          className="h-5 shrink-0 border-blue-500/30 bg-blue-500/15 px-1.5 py-0 text-[10px] text-blue-700 hover:bg-blue-500/30 dark:text-blue-400"
        >
          IT
        </Badge>
        <Badge
          variant="default"
          className="h-5 shrink-0 border-emerald-600/30 bg-emerald-600/15 px-1.5 py-0 text-[10px] text-emerald-800 hover:bg-emerald-600/25 dark:text-emerald-400"
        >
          AL
        </Badge>
      </div>
    );
  }
  if (isIT) {
    return (
      <Badge
        variant="default"
        className="h-5 shrink-0 border-blue-500/30 bg-blue-500/15 px-1.5 py-0 text-[10px] text-blue-700 hover:bg-blue-500/30 dark:text-blue-400"
      >
        IT TL
      </Badge>
    );
  }
  if (isAL) {
    return (
      <Badge
        variant="default"
        className="h-5 shrink-0 border-emerald-600/30 bg-emerald-600/15 px-1.5 py-0 text-[10px] text-emerald-800 hover:bg-emerald-600/25 dark:text-emerald-400"
      >
        AL TL
      </Badge>
    );
  }
  return <span className="text-[10px] text-muted-foreground">—</span>;
};

const renderCRScopeTeamsCell = ({
  profile,
  accessByUserId,
}: {
  profile: UserProfile;
  accessByUserId: Map<number, ControlRoomAccess>;
}) => {
  const scopes = accessByUserId.get(profile.user?.id)?.team_scopes ?? [];
  if (scopes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
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
      className="h-5 shrink-0 border-primary/30 bg-primary/15 px-1.5 py-0 text-[10px] text-foreground hover:bg-primary/20"
      title="Control Room access granted"
    >
      CR
    </Badge>
  ) : (
    <span className="text-[10px] text-muted-foreground">—</span>
  );

export const useUserColumns = (
  onEdit: (profile: UserProfile) => void,
  onReset: (userId: number) => void,
  onDelete: (profile: UserProfile) => void,
  options: UseUserColumnsOptions = {}
): ColumnDef<UserProfile>[] => {
  const {
    crActive = false,
    crAccessUserIds = new Set<number>(),
    crAccessByUserId = new Map<number, ControlRoomAccess>(),
    showCRScopeTeams = false,
  } = options;
  const navigate = useNavigate();

  return useMemo(() => {
    const base: ColumnDef<UserProfile>[] = [
      {
        id: "username",
        accessorKey: "user.username",
        header: "Username",
        size: 140,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.user?.username}</span>
        ),
      },
      {
        id: "email",
        accessorKey: "user.email",
        header: "Email",
        size: 200,
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate text-sm text-muted-foreground"
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
              size: 160,
              cell: ({ row }: { row: { original: UserProfile } }) => {
                const teams = row.original.teams_detail;
                if (teams && teams.length > 0) {
                  return (
                    <div className="flex flex-wrap gap-1">
                      {teams.map((t) => (
                        <Badge key={t.id} variant="secondary" className="text-[10px] font-normal">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  );
                }
                return row.original.team_name || <span className="text-muted-foreground">—</span>;
              },
              enableSorting: false,
            } as ColumnDef<UserProfile>,
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
              size: 220,
              cell: ({ row }: { row: { original: UserProfile } }) =>
                renderCRScopeTeamsCell({
                  profile: row.original,
                  accessByUserId: crAccessByUserId,
                }),
              enableSorting: false,
            } as ColumnDef<UserProfile>,
          ]
        : []),
      // Independent technology assignments (descriptive metadata, not
      // permission/calendar scope). Always visible to all admins.
      {
        id: "techs",
        accessorKey: "techs",
        header: "Tech",
        size: 160,
        cell: ({ row }: { row: { original: UserProfile } }) => {
          const techs = row.original.techs_detail;
          if (techs && techs.length > 0) {
            return (
              <div className="flex flex-wrap gap-1">
                {techs.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="border-violet-500/30 bg-violet-500/10 text-[10px] font-normal text-violet-400 hover:bg-violet-500/20"
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            );
          }
          return <span className="text-[10px] text-muted-foreground">—</span>;
        },
        enableSorting: false,
      },
      {
        id: "hire_date",
        accessorKey: "hire_date",
        header: "Hire Date",
        size: 110,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{formatDateDDMMYYYY(row.original.hire_date)}</span>
        ),
      },
      {
        id: "tl_role",
        header: "TL Role",
        size: 120,
        cell: ({ row }) => renderTLRoleCell({ profile: row.original }),
      },
    ];

    // Plugin-aware CR badge column — only included when control_room is
    // active. Zero footprint (no column, no DOM) when plugin inactive.
    if (crActive) {
      base.push({
        id: "cr_access",
        header: "CR",
        size: 60,
        cell: ({ row }) =>
          renderCRAccessCell({ profile: row.original, accessUserIds: crAccessUserIds }),
      });
    }

    base.push(
      {
        id: "it_tl_assigned",
        accessorKey: "italian_tl_name",
        header: "IT TL (Assigned)",
        size: 130,
        cell: ({ row }) =>
          row.original.italian_tl_name ? (
            <span className="text-xs font-medium">{row.original.italian_tl_name}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "al_tl_assigned",
        accessorKey: "albanian_tl_name",
        header: "AL TL (Assigned)",
        size: 130,
        cell: ({ row }) =>
          row.original.albanian_tl_name ? (
            <span className="text-xs font-medium">{row.original.albanian_tl_name}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        size: 120,
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-primary/10"
              onClick={() => onEdit(row.original)}
              aria-label={`Edit user ${row.original.user?.username}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-warning hover:bg-warning/10"
              onClick={() => onReset(row.original.user?.id)}
              aria-label={`Reset password for ${row.original.user?.username}`}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(row.original)}
              aria-label={`Delete user ${row.original.user?.username}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {crActive && !crAccessUserIds.has(row.original.user?.id) && row.original.user?.id && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-primary/10"
                onClick={() =>
                  navigate(`/admin/control-room/access?user_id=${row.original.user?.id}`)
                }
                aria-label={`Grant Control Room access to ${row.original.user?.username}`}
                title="Grant Control Room access"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
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
    navigate,
  ]);
};
