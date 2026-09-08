import React, { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Inbox } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface GroupableRow {
  id: number;
  user: number;
  team_name?: string | null;
}
interface GroupSection<T extends GroupableRow> {
  key: string;
  title: string;
  rows: T[];
}

interface TeamGroupedTablesProps<T extends GroupableRow> {
  rows: T[];
  columnsBuilder: (currentRows: T[]) => ColumnDef<T>[];
  emptyCopy: string;
  memberGroupMode: "none" | "team" | "italian_tl";
  userMetaMap: Map<number, { teamNames: string[]; italianTlName?: string | null }>;
}

// fallow-ignore-next-line complexity
export const TeamGroupedTables = <T extends GroupableRow>({
  rows,
  columnsBuilder,
  emptyCopy,
  memberGroupMode,
  userMetaMap,
}: TeamGroupedTablesProps<T>) => {
  const buildGroupSections = useCallback(
    (data: T[]): GroupSection<T>[] => {
      if (!data.length) return [];
      if (memberGroupMode === "none") return [{ key: "all", title: "All entries", rows: data }];
      const sections = new Map<string, GroupSection<T>>();
      const slugify = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "na";
      // fallow-ignore-next-line complexity
      data.forEach((row) => {
        const meta = userMetaMap.get(row.user);
        if (memberGroupMode === "team") {
          const teamName = row.team_name || meta?.teamNames?.[0] || "No Team";
          const key = `team-${slugify(teamName)}`;
          if (!sections.has(key))
            sections.set(key, { key, title: teamName.toUpperCase(), rows: [] });
          sections.get(key)!.rows.push(row);
        } else {
          const tlName =
            meta?.italianTlName && meta.italianTlName.length > 0
              ? meta.italianTlName
              : "Unassigned Italian TL";
          const key = `itl-${slugify(tlName)}`;
          if (!sections.has(key))
            sections.set(key, { key, title: `ITALIAN TL — ${tlName.toUpperCase()}`, rows: [] });
          sections.get(key)!.rows.push(row);
        }
      });
      return Array.from(sections.values()).sort((a, b) => a.title.localeCompare(b.title));
    },
    [memberGroupMode, userMetaMap]
  );

  if (!rows.length) {
    return (
      <GlassCard isHoverLift={false}>
        <EmptyState icon={Inbox} title="No results" description={emptyCopy} />
      </GlassCard>
    );
  }

  if (memberGroupMode === "none") {
    return (
      <GlassCard className="p-4">
        <DataTable
          data={rows}
          columns={columnsBuilder(rows)}
          getRowId={(row) => row.id.toString()}
        />
      </GlassCard>
    );
  }

  const sections = buildGroupSections(rows);
  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const uniqueMembers = new Set(section.rows.map((row) => row.user)).size;
        const memberLabel = `${uniqueMembers} ${uniqueMembers === 1 ? "member" : "members"}`;
        const entryLabel = `${section.rows.length} ${section.rows.length === 1 ? "entry" : "entries"}`;
        return (
          <GlassCard key={section.key} className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="space-y-1">
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                >
                  {memberGroupMode === "team" ? "Team" : "Italian TL"}
                </Badge>
                <p className="text-lg font-semibold tracking-tight">
                  {section.title}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    — {memberLabel}
                  </span>
                </p>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-sm font-semibold">
                {entryLabel}
              </Badge>
            </div>
            <DataTable
              data={section.rows}
              columns={columnsBuilder(section.rows)}
              getRowId={(row) => row.id.toString()}
            />
          </GlassCard>
        );
      })}
    </div>
  );
};
