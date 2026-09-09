/** TL/HR team skills matrix page with KPI cards, 2D sticky table, and export. */
import React, { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Download, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useMatrix,
  useCoverage,
  useGapReport,
  useExportMatrix,
  useSkillCategories,
  useRateUserSkill,
} from "../hooks/useSkillsQueries";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getPersistedVisibleSkillIds, getVisibleCoverage } from "../utils/skillMatrixSelectors";
import type { SkillsViewMode } from "../types/skills";
import { SkillsTeamToolbar } from "../components/SkillsTeamToolbar";
import { SkillsScaleHint } from "../components/SkillsScaleHint";
import { SkillsKpiCards } from "../components/SkillsKpiCards";
import { SkillsLevelLegend } from "../components/SkillsLevelLegend";
import { SkillsMemberList } from "../components/SkillsMemberList";
import { RateSkillDialog } from "../components/RateSkillDialog";
import { SkillsPagination } from "../components/SkillsPagination";
import { SkillsTeamFilters } from "../components/SkillsTeamFilters";
import { SkillsMatrixTable } from "../components/SkillsMatrixTable";
import { SkillsHeatmapGrid } from "../components/SkillsHeatmapGrid";
import { SkillsDenseMatrix } from "../components/SkillsDenseMatrix";
import { SkillsMemberCard } from "../components/SkillsMemberCard";

/** Page size for the matrix — kept as a constant so totalPages stays in sync. */
const PAGE_SIZE = 25;
const VISIBLE_COLUMNS_STORAGE_KEY = "skills-visible-columns";

export const SkillsTeamPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [categoryCode, setCategoryCode] = useState<string>("all");
  const [minLevel, setMinLevel] = useState<number | undefined>(undefined);
  const [maxLevel, setMaxLevel] = useState<number | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<SkillsViewMode>("matrix");
  const [rateTarget, setRateTarget] = useState<{
    userSkillId: number;
    username: string;
    skillName: string;
    currentLevel: number;
  } | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  // Default to {0, 0} so the first cell is keyboard-focusable on initial
  // render (WAI-ARIA grid pattern requires one focusable cell).
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({
    row: 0,
    col: 0,
  });

  const { data: categories = [] } = useSkillCategories(true);
  const {
    data: matrixData,
    isLoading,
    error: matrixError,
    refetch: refetchMatrix,
  } = useMatrix({
    search: search || undefined,
    category: categoryCode !== "all" ? categoryCode : undefined,
    min_level: minLevel,
    max_level: maxLevel,
    page,
    page_size: PAGE_SIZE,
  });
  const { data: coverage = [] } = useCoverage(categoryCode !== "all" ? categoryCode : undefined);
  const [visibleSkillIds, setVisibleSkillIds] = useState<Set<number> | null>(() =>
    coverage.length > 0
      ? getPersistedVisibleSkillIds(
          window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY),
          new Set(coverage.map((skill) => skill.skill_id))
        )
      : null
  );
  const { data: gaps = [] } = useGapReport(
    categoryCode !== "all" ? categoryCode : undefined,
    undefined,
    5
  );
  const exportMutation = useExportMatrix();
  const rateMutation = useRateUserSkill();

  const reconciledVisibleSkillIds = React.useMemo(() => {
    if (coverage.length === 0) return new Set<number>();
    const availableSkillIds = new Set(coverage.map((skill) => skill.skill_id));
    const next = new Set(
      [...(visibleSkillIds ?? availableSkillIds)].filter((id) => availableSkillIds.has(id))
    );
    if (next.size === 0) next.add(coverage[0].skill_id);
    return next;
  }, [coverage, visibleSkillIds]);

  useEffect(() => {
    if (reconciledVisibleSkillIds.size === 0) return;
    window.localStorage.setItem(
      VISIBLE_COLUMNS_STORAGE_KEY,
      JSON.stringify([...reconciledVisibleSkillIds].sort((a, b) => a - b))
    );
  }, [reconciledVisibleSkillIds]);

  const rows = matrixData?.results ?? [];
  const renderedCoverage = getVisibleCoverage(coverage, reconciledVisibleSkillIds);
  const renderedSkillIds = reconciledVisibleSkillIds;
  const totalPages = matrixData?.count ? Math.ceil(matrixData.count / PAGE_SIZE) : 1;
  const totalGridRows = matrixData?.count ? matrixData.count + 2 : 2;
  const firstBodyRowIndex = (page - 1) * PAGE_SIZE + 3;

  const handleExport = () => {
    exportMutation.mutate(
      {
        category: categoryCode !== "all" ? categoryCode : undefined,
        search: search || undefined,
      },
      {
        onSuccess: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "skills_matrix.csv";
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Export downloaded");
        },
        onError: () => toast.error("Export failed"),
      }
    );
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryCode("all");
    setMinLevel(undefined);
    setMaxLevel(undefined);
    setPage(1);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleCategoryChange = (code: string) => {
    setCategoryCode(code);
    setPage(1);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleMinLevelChange = (level: number | undefined) => {
    setMinLevel(level);
    setPage(1);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleMaxLevelChange = (level: number | undefined) => {
    setMaxLevel(level);
    setPage(1);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleViewModeChange = (mode: SkillsViewMode) => {
    setViewMode(mode);
    setFocusedCell({ row: 0, col: 0 });
  };

  const handleRateSubmit = (level: number) => {
    if (!rateTarget) return;
    rateMutation.mutate(
      { id: rateTarget.userSkillId, data: { level } },
      {
        onSuccess: () => {
          toast.success(`Rated ${rateTarget.username}'s ${rateTarget.skillName} as L${level}`);
          setRateTarget(null);
        },
        onError: () => toast.error("Failed to update rating"),
      }
    );
  };

  return (
    <PageShell
      title="Team Skills & Capability Engine"
      subtitle="View and rate your team's skill proficiencies"
      category="Skills"
      actions={
        <div className="flex flex-wrap gap-2">
          <PluginImportButton
            targetKey="user_skills"
            label="Import ratings"
            invalidateKeys={[["skills"]]}
          />
          <Button
            onClick={handleExport}
            size="sm"
            variant="outline"
            disabled={exportMutation.isPending}
          >
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      }
    >
      {/* Eyebrow pill (mockup header) */}
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-foreground">
          Skills Matrix
        </span>
        <span className="text-xs font-medium text-muted-foreground">Q3 Team Competency</span>
      </div>

      <SkillsKpiCards coverage={coverage} gaps={gaps} memberCount={matrixData?.count ?? 0} />

      <SkillsTeamToolbar
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        memberCount={matrixData?.count ?? 0}
        isMobile={isMobile}
        onFiltersOpen={() => setFiltersOpen(true)}
        coverage={coverage}
        visibleSkillIds={renderedSkillIds}
        onVisibleSkillIdsChange={setVisibleSkillIds}
      />

      <SkillsScaleHint
        skillCount={renderedCoverage.length}
        viewMode={viewMode}
        isMobile={isMobile}
        onSwitchToDense={() => handleViewModeChange("dense")}
        onSwitchToHeatmap={() => handleViewModeChange("heatmap")}
      />

      <SkillsTeamFilters
        search={search}
        onSearchChange={handleSearchChange}
        categoryCode={categoryCode}
        onCategoryChange={handleCategoryChange}
        minLevel={minLevel}
        onMinLevelChange={handleMinLevelChange}
        maxLevel={maxLevel}
        onMaxLevelChange={handleMaxLevelChange}
        onReset={resetFilters}
        categories={categories}
        gaps={gaps}
        isMobile={isMobile}
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
      />

      <div className="pt-1">
        <SkillsLevelLegend />
      </div>

      {/* Matrix workspace panel — mobile card list or desktop 2D sticky grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && matrixError && !matrixData && (
        <ErrorCard
          title="Failed to load team skills"
          message="Could not fetch team skills. Please check your connection and try again."
          onRetry={() => void refetchMatrix()}
        />
      )}
      {!isLoading && !matrixError && rows.length === 0 && (
        <EmptyState
          icon={Users}
          title="No team members found"
          description="Try adjusting filters or search to see more results."
        />
      )}
      {!isLoading && rows.length > 0 && isMobile && (
        <SkillsMemberCard
          rows={rows}
          coverage={renderedCoverage}
          expandedUserId={expandedUserId}
          onExpandedUserIdChange={setExpandedUserId}
          onRate={setRateTarget}
        />
      )}
      {!isLoading && rows.length > 0 && !isMobile && viewMode === "list" && (
        <SkillsMemberList rows={rows} onRate={setRateTarget} />
      )}
      {!isLoading && rows.length > 0 && !isMobile && viewMode !== "list" && (
        <GlassCard isHoverLift={false} className="mt-1 overflow-hidden p-0">
          {viewMode === "matrix" && (
            <SkillsMatrixTable
              rows={rows}
              renderedCoverage={renderedCoverage}
              totalGridRows={totalGridRows}
              firstBodyRowIndex={firstBodyRowIndex}
              focusedCell={focusedCell}
              onFocusedCellChange={setFocusedCell}
              onRate={setRateTarget}
            />
          )}
          {viewMode === "dense" && (
            <SkillsDenseMatrix
              rows={rows}
              renderedCoverage={renderedCoverage}
              totalGridRows={totalGridRows}
              firstBodyRowIndex={firstBodyRowIndex}
              focusedCell={focusedCell}
              onFocusedCellChange={setFocusedCell}
              onRate={setRateTarget}
            />
          )}
          {viewMode === "heatmap" && (
            <SkillsHeatmapGrid
              rows={rows}
              renderedCoverage={renderedCoverage}
              totalGridRows={totalGridRows}
              firstBodyRowIndex={firstBodyRowIndex}
              focusedCell={focusedCell}
              onFocusedCellChange={setFocusedCell}
              onRate={setRateTarget}
            />
          )}
          {/* Footer stats bar (mockup lines 267–276) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-foreground">
                {matrixData?.count ?? 0} Team Members Loaded
              </span>
              <span aria-hidden="true">•</span>
              <span>Click any cell to rate · arrow keys to navigate</span>
            </div>
            <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-foreground">
              {viewMode === "matrix" ? "Matrix" : viewMode === "dense" ? "Dense" : "Heatmap"} view
            </span>
          </div>
        </GlassCard>
      )}

      {/* Pagination */}
      <SkillsPagination
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => {
          setPage(p);
          setFocusedCell({ row: 0, col: 0 });
        }}
      />

      {/* Rate stepper dialog — 5 one-click level buttons */}
      <RateSkillDialog
        target={rateTarget}
        isPending={rateMutation.isPending}
        onSubmit={handleRateSubmit}
        onClose={() => setRateTarget(null)}
      />
    </PageShell>
  );
};
