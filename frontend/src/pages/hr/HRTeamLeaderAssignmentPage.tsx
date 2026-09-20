import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { TechFacetFilter } from "@/components/admin/TechFacetFilter";
import { TeamLeaderSelect } from "@/components/admin/TeamLeaderSelect";
import { useHRTeamLeaderAssignment } from "./hooks/useHRTeamLeaderAssignment";
import type { UserProfile } from "@/types";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";

export const HRTeamLeaderAssignmentPage: React.FC = () => {
  const {
    profiles,
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

  const handleBulkSetLeader = async (
    role: "italian_tl" | "albanian_tl",
    teamLeaderUserId: number | null
  ) => {
    if (selectedProfileIds.length === 0 || isBulkApplying) return;
    setIsBulkApplying(true);
    try {
      const { failed } = await setTeamLeaderBulkAsync(
        selectedProfileIds.map((profileId) => ({ profileId, role, teamLeaderUserId }))
      );
      if (failed === 0) setRowSelection({});
    } finally {
      setIsBulkApplying(false);
    }
  };

  const columns = useMemo<ColumnDef<UserProfile>[]>(
    () => [
      {
        accessorKey: "user.username",
        header: "User",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.user.username}</div>
            <div className="text-xs text-muted-foreground">
              {[row.original.user.first_name, row.original.user.last_name]
                .filter(Boolean)
                .join(" ")}
            </div>
          </div>
        ),
      },
      {
        id: "italian_tl",
        header: "Italian TL",
        cell: ({ row }) => (
          <TeamLeaderSelect
            ariaLabel={`Italian TL for ${row.original.user.username}`}
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
        header: "Albanian TL",
        cell: ({ row }) => (
          <TeamLeaderSelect
            ariaLabel={`Albanian TL for ${row.original.user.username}`}
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
        <GlassCard delay={0} className="space-y-4 p-4">
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
          <BulkActionBar
            selectedCount={selectedProfileIds.length}
            onClear={() => setRowSelection({})}
            entityName="users"
            actions={[]}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <TeamLeaderSelect
                  ariaLabel="Bulk set Italian TL"
                  value={null}
                  options={italianTLs}
                  disabled={isBulkApplying}
                  onChange={(teamLeaderUserId) =>
                    handleBulkSetLeader("italian_tl", teamLeaderUserId)
                  }
                />
              </div>
              <div className="w-40">
                <TeamLeaderSelect
                  ariaLabel="Bulk set Albanian TL"
                  value={null}
                  options={albanianTLs}
                  disabled={isBulkApplying}
                  onChange={(teamLeaderUserId) =>
                    handleBulkSetLeader("albanian_tl", teamLeaderUserId)
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
          />
        </GlassCard>
      )}
    </PageShell>
  );
};

export default HRTeamLeaderAssignmentPage;
