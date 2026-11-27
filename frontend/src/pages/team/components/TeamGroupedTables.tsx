import React, { memo, useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import {
  readStoredColumnOverride,
  writeStoredColumnOverride,
} from "@/components/ui/columnVisibilityStorage";
import { EmptyState } from "@/components/ui/EmptyState";
import { toneTextClass } from "@/components/ui/tone";
import { DURATION, EASE, useMotionTransition } from "@/lib/motion";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";

interface GroupableRow {
  id: number;
  user: number;
  team_name?: string | null;
}
interface GroupSection<T extends GroupableRow> {
  key: string;
  title: string;
  rows: T[];
  summary?: string;
  pendingLabel?: string;
}

export interface MonthlyTableSection<T extends GroupableRow> {
  key: string;
  title: string;
  rows: T[];
  summary?: string;
  pendingLabel?: string;
}

interface TeamGroupedTablesProps<T extends GroupableRow> {
  rows: T[];
  columnsBuilder: (currentRows: T[]) => AppColumnDef<T>[];
  emptyCopy: string;
  memberGroupMode: "range" | "none" | "team" | "italian_tl";
  userMetaMap: Map<number, { teamNames: string[]; italianTlName?: string | null }>;
  /** Phone card layout passed to every table, grouped or not. */
  mobileCard?: DataTableCardSpec;
  enableColumnVisibility?: boolean;
  storageKey?: string;
  defaultColumnVisibility?: Record<string, boolean>;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  buildSections?: (rows: T[]) => MonthlyTableSection<T>[];
  getRowClassName?: (row: T) => string;
  /** Called with the row ids (`getRowId` strings) of a month section when it collapses. */
  onSectionCollapse?: (rowIds: string[]) => void;
}

const getRowIdString = (row: GroupableRow) => row.id.toString();

interface MonthSectionProps<T extends GroupableRow> {
  section: MonthlyTableSection<T>;
  collapsed: boolean;
  onToggle: (key: string, isCollapsed: boolean, rowIds: string[]) => void;
  columnsBuilder: (currentRows: T[]) => AppColumnDef<T>[];
  mobileCard?: DataTableCardSpec;
  getRowClassName?: (row: T) => string;
  tableProps: Record<string, unknown>;
}

const MonthSectionInner = <T extends GroupableRow>({
  section,
  collapsed,
  onToggle,
  columnsBuilder,
  mobileCard,
  getRowClassName,
  tableProps,
}: MonthSectionProps<T>) => {
  const enterTransition = useMotionTransition({ duration: DURATION.fast, ease: EASE.standard });
  const columns = useMemo(() => columnsBuilder(section.rows), [columnsBuilder, section.rows]);
  const bodyId = `team-month-section-${section.key}`;
  return (
    <GlassCard className="overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={() =>
          onToggle(
            section.key,
            collapsed,
            section.rows.map((r) => getRowIdString(r))
          )
        }
        className="border-border/60 bg-muted/30 hover:bg-muted/50 flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-left text-xs tabular-nums transition-colors"
      >
        <span className="text-foreground flex items-center gap-2 font-semibold">
          {collapsed ? (
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          )}
          {section.title}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-2">
          {section.summary && <span>{section.summary}</span>}
          {section.pendingLabel && (
            <span className={`font-medium ${toneTextClass.warning}`}>{section.pendingLabel}</span>
          )}
        </span>
      </button>
      {!collapsed && (
        <motion.div
          id={bodyId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={enterTransition}
          className="p-4"
        >
          <DataTable
            data={section.rows}
            columns={columns}
            getRowId={getRowIdString}
            mobileCard={mobileCard}
            getRowClassName={getRowClassName}
            {...tableProps}
          />
        </motion.div>
      )}
    </GlassCard>
  );
};

const MonthSection = memo(MonthSectionInner) as typeof MonthSectionInner;

// fallow-ignore-next-line complexity
export const TeamGroupedTables = <T extends GroupableRow>({
  rows,
  columnsBuilder,
  emptyCopy,
  memberGroupMode,
  userMetaMap,
  mobileCard,
  enableColumnVisibility = false,
  storageKey,
  defaultColumnVisibility,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  buildSections,
  getRowClassName,
  onSectionCollapse,
}: TeamGroupedTablesProps<T>) => {
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  // The user's explicit Columns-menu choices (v2): a `true` pins a column against auto-fit.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    readStoredColumnOverride(storageKey, defaultColumnVisibility)
  );
  // Explicit user choices only; absent key = default (newest month open, older months closed).
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});

  if (prevStorageKey !== storageKey) {
    setPrevStorageKey(storageKey);
    setColumnVisibility(readStoredColumnOverride(storageKey, defaultColumnVisibility));
  }

  const handleColumnVisibilityChange = useCallback(
    (next: Record<string, boolean>) => {
      setColumnVisibility(next);
      writeStoredColumnOverride(storageKey, next);
    },
    [storageKey]
  );

  const monthlySections = useMemo(
    () => (memberGroupMode === "range" && buildSections ? buildSections(rows) : []),
    [memberGroupMode, buildSections, rows]
  );

  const toggleSection = useCallback(
    (key: string, isCollapsed: boolean, sectionRowIds: string[]) => {
      setCollapseOverrides((prev) => ({ ...prev, [key]: !isCollapsed }));
      if (!isCollapsed && onSectionCollapse && sectionRowIds.length > 0) {
        onSectionCollapse(sectionRowIds);
      }
    },
    [onSectionCollapse]
  );

  const visibilityProps = useMemo(
    () =>
      enableColumnVisibility
        ? {
            enableColumnVisibility: true,
            storageKey,
            columnVisibility,
            onColumnVisibilityChange: handleColumnVisibilityChange,
          }
        : {},
    [enableColumnVisibility, storageKey, columnVisibility, handleColumnVisibilityChange]
  );
  const selectionProps = useMemo(
    () =>
      enableRowSelection
        ? {
            enableRowSelection: true,
            rowSelection,
            onRowSelectionChange,
          }
        : {},
    [enableRowSelection, rowSelection, onRowSelectionChange]
  );

  const tableProps = useMemo(
    () => ({ ...visibilityProps, ...selectionProps }),
    [visibilityProps, selectionProps]
  );

  const buildGroupSections = useCallback(
    (data: T[]): GroupSection<T>[] => {
      if (!data.length) return [];
      if (memberGroupMode === "none" || memberGroupMode === "range") {
        return [{ key: "all", title: "All entries", rows: data }];
      }
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
              : "Unassigned Manager";
          const key = `itl-${slugify(tlName)}`;
          if (!sections.has(key))
            sections.set(key, { key, title: `MANAGER — ${tlName.toUpperCase()}`, rows: [] });
          sections.get(key)!.rows.push(row);
        }
      });
      return Array.from(sections.values()).sort((a, b) => a.title.localeCompare(b.title));
    },
    [memberGroupMode, userMetaMap]
  );

  if (!rows.length) {
    return (
      <GlassCard>
        <EmptyState icon={Inbox} title="No results" description={emptyCopy} />
      </GlassCard>
    );
  }

  if (memberGroupMode === "range" && buildSections) {
    return (
      <div className="space-y-4">
        {monthlySections.map((section, index) => (
          <MonthSection
            key={section.key}
            section={section}
            collapsed={collapseOverrides[section.key] ?? index !== 0}
            onToggle={toggleSection}
            columnsBuilder={columnsBuilder}
            mobileCard={mobileCard}
            getRowClassName={getRowClassName}
            tableProps={tableProps}
          />
        ))}
      </div>
    );
  }

  if (memberGroupMode === "none" || memberGroupMode === "range") {
    return (
      <GlassCard className="p-4">
        <DataTable
          data={rows}
          columns={columnsBuilder(rows)}
          getRowId={(row) => row.id.toString()}
          mobileCard={mobileCard}
          getRowClassName={getRowClassName}
          {...visibilityProps}
          {...selectionProps}
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
            <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="space-y-1">
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
                >
                  {memberGroupMode === "team" ? "Team" : "Manager"}
                </Badge>
                <p className="text-lg font-semibold tracking-tight">
                  {section.title}
                  <span className="text-muted-foreground ml-2 text-sm font-medium">
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
              mobileCard={mobileCard}
              getRowClassName={getRowClassName}
              {...visibilityProps}
              {...selectionProps}
            />
          </GlassCard>
        );
      })}
    </div>
  );
};
