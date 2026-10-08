import React, { useMemo } from "react";
import { FileSpreadsheet, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { downloadBlobResponse } from "@/lib/download";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toneTextClass } from "@/components/ui/tone";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";
import { ExportButton } from "../ExportButton";
import {
  KIND_ICONS,
  RECORD_CONFIGS,
  parseKind,
  type RecordKind,
  type RecordRow,
} from "./recordKinds";
import { useRecordActions } from "./useRecordActions";
import { RecordListPanel } from "./RecordListPanel";
import { RecordStrip } from "./RecordStrip";
import { recordsToCsv } from "./recordsCsv";

const RECORDS_PAGE_SIZE = 8;

type StateFilter = "all" | "attention" | "done";

/** Toolbar verb per record kind for the create entry point. */
const CREATE_LABELS: Record<RecordKind, string> = {
  meetings: "Log meeting",
  idle: "Flag idle",
  absences: "Flag absence",
  reviews: "Log management review",
  promotions: "Nominate",
  pips: "Open PIP",
};

const parseStateFilter = (raw: string | null): StateFilter =>
  raw === "attention" || raw === "done" ? raw : "all";

const toneForState = (tone: string): boolean => tone === "warning" || tone === "danger";

/**
 * TL records workspace: filter toolbar, category sidebar and the record table,
 * following the reference mockup on theme tokens. Every number derives from
 * already-loaded rows — the mockup's durations, sync rates and targets have no
 * backend and are deliberately not shown.
 */
export const RecordsTab: React.FC<{ onCreateRecord?: (kind: RecordKind) => void }> = ({
  onCreateRecord,
}) => {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { isAdmin, isSuperuser } = usePermissions();
  const kind = parseKind(params.get("kind"));
  const month = params.get("month") ?? "";
  const search = (params.get("q") ?? "").trim().toLowerCase();
  const stateFilter = parseStateFilter(params.get("state"));
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const setParam = (key: string, value: string | null, keepPage = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (!keepPage) next.delete("page");
        return next;
      },
      { replace: true }
    );

  const results = useQueries({
    queries: RECORD_CONFIGS.map((config) => ({
      queryKey: ["tl-scorecard", "records", config.key],
      queryFn: config.fetch,
    })),
  });

  const viewer = useMemo(() => {
    const staff = isAdmin || isSuperuser;
    return { userId: user?.id ?? null, isStaff: staff, canReview: staff };
  }, [user?.id, isAdmin, isSuperuser]);

  const inMonth = (index: number, row: RecordRow): boolean => {
    if (!month) return true;
    return RECORD_CONFIGS[index].date(row).startsWith(month.slice(0, 7));
  };

  const matchesSearch = (index: number, row: RecordRow): boolean => {
    if (!search) return true;
    const config = RECORD_CONFIGS[index];
    const haystack = [
      config.title(row),
      config.state(row).label,
      config.person(row),
      config.typeChip(row),
      config.focus(row),
    ]
      .filter((cell): cell is string => typeof cell === "string")
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  };

  /** Month + search only: stable counts for badges and pills. */
  const baseRows = (index: number): RecordRow[] | undefined =>
    results[index].data?.filter((row) => inMonth(index, row) && matchesSearch(index, row));

  const inState = (index: number, row: RecordRow): boolean => {
    if (stateFilter === "all") return true;
    const tone = RECORD_CONFIGS[index].state(row).tone;
    return stateFilter === "attention" ? toneForState(tone) : tone === "success";
  };

  const activeIndex = RECORD_CONFIGS.findIndex((config) => config.key === kind);
  const activeRows = useMemo(() => {
    const base = baseRows(activeIndex);
    return base?.filter((row) => inState(activeIndex, row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, activeIndex, month, search, stateFilter]);
  const totalCount = results[activeIndex].data?.length ?? 0;
  const monthCount = baseRows(activeIndex)?.length ?? 0;

  const attentionCount = useMemo(
    () =>
      (baseRows(activeIndex) ?? []).filter((row) =>
        toneForState(RECORD_CONFIGS[activeIndex].state(row).tone)
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, activeIndex, month, search]
  );

  const summary = useMemo(() => {
    let done = 0;
    let total = 0;
    results.forEach((result, index) => {
      for (const row of result.data ?? []) {
        if (!inMonth(index, row)) continue;
        total += 1;
        if (RECORD_CONFIGS[index].state(row).tone === "success") done += 1;
      }
    });
    return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, month]);

  const totalPages = Math.max(1, Math.ceil((activeRows?.length ?? 0) / RECORDS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = activeRows?.slice(
    (safePage - 1) * RECORDS_PAGE_SIZE,
    safePage * RECORDS_PAGE_SIZE
  );

  const latest = useMemo(() => {
    let best: RecordRow | null = null;
    for (const row of activeRows ?? []) {
      if (RECORD_CONFIGS[activeIndex].focus(row) === null) continue;
      if (!best || RECORD_CONFIGS[activeIndex].date(row) > RECORD_CONFIGS[activeIndex].date(best)) {
        best = row;
      }
    }
    if (!best) return null;
    const focus = RECORD_CONFIGS[activeIndex].focus(best);
    if (!focus) return null;
    return {
      row: best,
      snippet: { person: RECORD_CONFIGS[activeIndex].person(best), focus },
    };
  }, [activeRows, activeIndex]);

  const { run, view, dialogs } = useRecordActions(viewer);

  const pills: { value: StateFilter; label: string }[] = [
    { value: "all", label: "All" },
    {
      value: "attention",
      label: attentionCount > 0 ? `Needs attention (${attentionCount})` : "Needs attention",
    },
    { value: "done", label: "Completed" },
  ];

  return (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <GlassCard animateOnMount={false} className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Label
              htmlFor="records-month"
              className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
            >
              Timeframe
            </Label>
            <Input
              id="records-month"
              type="month"
              className="w-48"
              value={month.slice(0, 7)}
              onChange={(e) => setParam("month", e.target.value ? `${e.target.value}-01` : null)}
            />
            <span className="bg-border hidden h-6 w-px sm:block" aria-hidden="true" />
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="State filter"
            >
              {pills.map((pill) => {
                const active = stateFilter === pill.value;
                return (
                  <button
                    key={pill.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setParam("state", pill.value === "all" ? null : pill.value)}
                    className={`min-h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64 sm:flex-none">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id="records-search"
                type="search"
                aria-label="Search records or members"
                placeholder="Search records or members…"
                className="pl-8"
                value={params.get("q") ?? ""}
                onChange={(e) => setParam("q", e.target.value || null)}
              />
            </div>
            {onCreateRecord && (
              <Button onClick={() => onCreateRecord(kind)} className="shrink-0">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {CREATE_LABELS[kind]}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Export visible records (CSV)"
              title="Export visible records (CSV)"
              onClick={() => {
                const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
                downloadBlobResponse(
                  new Blob([recordsToCsv(RECORD_CONFIGS[activeIndex], activeRows ?? [])], {
                    type: "text/csv",
                  }),
                  `tl-${kind}-records-${stamp}.csv`
                );
              }}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </Button>
            <ExportButton iconOnly month={month || undefined} />
          </div>
        </div>
      </GlassCard>

      {/* Master-detail */}
      <Tabs value={kind} onValueChange={(value) => setParam("kind", value as RecordKind)}>
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <div className="lg:hidden">
              <Label htmlFor="records-kind">Record type</Label>
              <Select value={kind} onValueChange={(value) => setParam("kind", value as RecordKind)}>
                <SelectTrigger id="records-kind" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_CONFIGS.map((config) => (
                    <SelectItem key={config.key} value={config.key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <GlassCard animateOnMount={false} className="hidden p-3 lg:block">
              <p className="text-muted-foreground px-3 py-2 text-xs font-bold tracking-wider uppercase">
                Record Categories
              </p>
              <TabsList
                aria-label="Record categories"
                className="flex h-auto flex-col items-stretch gap-1.5 bg-transparent p-0"
              >
                {RECORD_CONFIGS.map((config, index) => {
                  const Icon = KIND_ICONS[config.key].icon;
                  const tone = KIND_ICONS[config.key].tone;
                  const count = baseRows(index)?.length ?? 0;
                  return (
                    <TabsTrigger
                      key={config.key}
                      value={config.key}
                      className="group data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60 data-[state=inactive]:hover:text-foreground flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm data-[state=active]:font-semibold data-[state=active]:shadow-sm"
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${toneTextClass[tone]}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{config.label}</span>
                      <span className="bg-muted text-muted-foreground group-data-[state=active]:bg-background/20 group-data-[state=active]:text-background ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {count}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <div className="border-line-subtle mt-4 border-t px-2 pt-4">
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Resolved</span>
                  <span className="text-foreground font-semibold tabular-nums">{summary.pct}%</span>
                </div>
                <div
                  className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={summary.pct}
                  aria-label="Resolved records"
                >
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${summary.pct}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Share of completed records across all categories.
                </p>
              </div>
            </GlassCard>
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-9">
            {RECORD_CONFIGS.map((config, index) => (
              <TabsContent key={config.key} value={config.key} className="mt-0 min-w-0">
                {index === activeIndex && (
                  <div className="space-y-4">
                    {activeRows && (
                      <RecordStrip
                        config={config}
                        rows={activeRows}
                        totalTrend={
                          month || stateFilter !== "all"
                            ? `of ${monthCount} total`
                            : "across all months"
                        }
                      />
                    )}
                    <RecordListPanel
                      config={config}
                      rows={pageRows ?? []}
                      total={activeRows?.length ?? 0}
                      page={safePage}
                      pageSize={RECORDS_PAGE_SIZE}
                      onPageChange={(next) => setParam("page", String(next), true)}
                      latest={latest}
                      historyHref={`?tab=records&kind=${kind}`}
                      totalCount={totalCount}
                      isLoading={results[index].isLoading}
                      error={results[index].error}
                      onRetry={() => results[index].refetch()}
                      viewer={viewer}
                      onAction={(action, record) => run(action, config, record)}
                      onView={(record) => view(config, record)}
                    />
                  </div>
                )}
              </TabsContent>
            ))}
          </div>
        </div>
      </Tabs>
      {dialogs}
    </div>
  );
};
