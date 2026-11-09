import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatCard } from "@/components/ui/StatCard";
import { UserCell } from "@/components/admin/UserCell";
import { UserCheck, UserX, Users } from "lucide-react";
import { TechFacetFilter } from "@/components/admin/TechFacetFilter";
import { TeamLeaderSelect } from "@/components/admin/TeamLeaderSelect";
import { useHRTeamLeaderAssignment } from "./hooks/useHRTeamLeaderAssignment";
import type { UserProfile } from "@/types";
import type { RowSelectionState } from "@tanstack/react-table";
import type { AppColumnDef } from "@/components/ui/tableTypes";

type BulkChange = { role: "italian_tl" | "albanian_tl"; teamLeaderUserId: number | null };

/** Phone card: the user, then the two leader pickers (same selects as the table). */
const TL_ASSIGNMENT_CARD: DataTableCardSpec = {
  title: "user_username",
  meta: ["italian_tl", "albanian_tl"],
};

const BULK_ROLE_LABEL = { italian_tl: "Manager", albanian_tl: "Line Manager" } as const;

export const HRTeamLeaderAssignmentPage: React.FC = () => {
  const {
    profiles,
    assignmentCounts,
    isLoading,
    techFacets,
    noTechCount,
    techIds,
    techLevelIds,
    noTechOnly,
    setTechIds,
    setTechLevelIds,
    setNoTechOnly,
    italianTLs,
    albanianTLs,
    setTeamLeader,
    setTeamLeaderBulkAsync,
    isSaving,
  } = useHRTeamLeaderAssignment();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const selectedProfileIds = Object.keys(rowSelection)
    .filter((id) => rowSelection[id])
    .map(Number);

  const [pendingBulk, setPendingBulk] = useState<BulkChange | null>(null);

  const handleBulkSetLeader = async ({ role, teamLeaderUserId }: BulkChange) => {
    if (selectedProfileIds.length === 0 || isBulkApplying) return;
    setIsBulkApplying(true);
    try {
      const { failed } = await setTeamLeaderBulkAsync(
        selectedProfileIds.map((profileId) => ({ profileId, role, teamLeaderUserId }))
      );
      if (failed === 0) setRowSelection({});
    } finally {
      setIsBulkApplying(false);
      setPendingBulk(null);
    }
  };

  const bulkDescription = (change: BulkChange) => {
    const label = BULK_ROLE_LABEL[change.role];
    const options = change.role === "italian_tl" ? italianTLs : albanianTLs;
    const count = selectedProfileIds.length;
    const people = `${count} ${count === 1 ? "employee" : "employees"}`;
    const name = options.find((tl) => tl.id === change.teamLeaderUserId)?.full_name;
    return name
      ? `Assign ${name} as ${label} to ${people}.`
      : `Remove the ${label} from ${people}.`;
  };

  // Server totals (the list is page-capped); the loaded rows are only a fallback.
  const counts = useMemo(
    () => ({
      total: assignmentCounts?.total ?? profiles.length,
      italian: assignmentCounts?.italian ?? profiles.filter((p) => p.italian_tl).length,
      albanian: assignmentCounts?.albanian ?? profiles.filter((p) => p.albanian_tl).length,
      none:
        assignmentCounts?.without_any ??
        profiles.filter((p) => !p.italian_tl && !p.albanian_tl).length,
    }),
    [assignmentCounts, profiles]
  );

  const columns = useMemo<AppColumnDef<UserProfile>[]>(
    () => [
      {
        accessorKey: "user.username",
        header: "User",
        cell: ({ row }) => {
          const { username, first_name, last_name, email } = row.original.user;
          const fullName = [first_name, last_name].filter(Boolean).join(" ");
          const techList = (row.original.techs_detail ?? [])
            .map((ta) => `${ta.name || ""}${ta.level ? ` ${ta.level.code}` : ""}`.trim())
            .filter(Boolean);
          return (
            <UserCell
              name={fullName || username}
              subtitle={fullName ? username : email || undefined}
              techLevels={techList.length > 0 ? techList : undefined}
            />
          );
        },
      },
      {
        id: "italian_tl",
        header: "Manager",
        cell: ({ row }) => (
          <TeamLeaderSelect
            ariaLabel={`Manager for ${row.original.user.username}`}
            value={row.original.italian_tl}
            currentName={row.original.italian_tl_name}
            options={italianTLs}
            disabled={isSaving}
            onChange={(teamLeaderUserId) =>
              setTeamLeader({
                profileId: row.original.id,
                role: "italian_tl",
                teamLeaderUserId,
              })
            }
          />
        ),
      },
      {
        id: "albanian_tl",
        header: "Line Manager",
        cell: ({ row }) => (
          <TeamLeaderSelect
            ariaLabel={`Line Manager for ${row.original.user.username}`}
            value={row.original.albanian_tl}
            currentName={row.original.albanian_tl_name}
            options={albanianTLs}
            disabled={isSaving}
            onChange={(teamLeaderUserId) =>
              setTeamLeader({
                profileId: row.original.id,
                role: "albanian_tl",
                teamLeaderUserId,
              })
            }
          />
        ),
      },
    ],
    [italianTLs, albanianTLs, isSaving, setTeamLeader]
  );

  return (
    <PageShell
      title="Team Leader Assignment"
      subtitle="Assign or remove which TL an employee reports to. Filter by Tech."
    >
      {isLoading ? (
        <LoadingCard rows={6} className="min-h-[400px]" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Assignable Employees"
              value={counts.total}
              icon={Users}
              iconTone="accent"
              glow="primary"
            />
            <StatCard
              label="With a Manager"
              value={counts.italian}
              icon={UserCheck}
              iconTone="info"
              glow="primary"
            />
            <StatCard
              label="With a Line Manager"
              value={counts.albanian}
              icon={UserCheck}
              iconTone="success"
              glow="success"
            />
            <StatCard
              label="Without any TL"
              value={counts.none}
              icon={UserX}
              iconTone="warning"
              glow="warning"
            />
          </div>
          <GlassCard delay={0} className="space-y-4 p-5">
            <div className="border-border/40 border-b pb-4">
              <TechFacetFilter
                facets={techFacets}
                noTechCount={noTechCount}
                selectedTechIds={techIds}
                selectedLevelIds={techLevelIds}
                noTechOnly={noTechOnly}
                onTechIdsChange={setTechIds}
                onLevelIdsChange={setTechLevelIds}
                onNoTechOnlyChange={setNoTechOnly}
              />
            </div>
            <BulkActionBar
              selectedCount={selectedProfileIds.length}
              onClear={() => setRowSelection({})}
              entityName="users"
              actions={[]}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-48">
                  <TeamLeaderSelect
                    ariaLabel="Bulk set Manager"
                    value={null}
                    options={italianTLs}
                    disabled={isBulkApplying}
                    onChange={(teamLeaderUserId) =>
                      setPendingBulk({ role: "italian_tl", teamLeaderUserId })
                    }
                  />
                </div>
                <div className="w-48">
                  <TeamLeaderSelect
                    ariaLabel="Bulk set Line Manager"
                    value={null}
                    options={albanianTLs}
                    disabled={isBulkApplying}
                    onChange={(teamLeaderUserId) =>
                      setPendingBulk({ role: "albanian_tl", teamLeaderUserId })
                    }
                  />
                </div>
              </div>
            </BulkActionBar>
            <DataTable
              columns={columns}
              data={profiles}
              searchColumn="user.username"
              searchPlaceholder="Search users..."
              getRowId={(row) => String(row.id)}
              emptyMessage="No users match your filters."
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              mobileCard={TL_ASSIGNMENT_CARD}
            />
          </GlassCard>
          <ConfirmDialog
            open={pendingBulk !== null}
            onOpenChange={(open) => {
              if (!open) setPendingBulk(null);
            }}
            title="Confirm bulk assignment"
            description={pendingBulk ? bulkDescription(pendingBulk) : undefined}
            onConfirm={() => pendingBulk && handleBulkSetLeader(pendingBulk)}
            isConfirming={isBulkApplying}
          />
        </>
      )}
    </PageShell>
  );
};

export default HRTeamLeaderAssignmentPage;
