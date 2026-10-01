import React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";
import { RecordListPanel } from "./RecordListPanel";
import { parseKind, RECORD_CONFIGS, type RecordRow, type Viewer } from "./recordKinds";
import { TlPicker } from "./TlPicker";
import { useRecordActions } from "./useRecordActions";

export const RecordsTab: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { isHBPR, isTeamLeader, isAdmin, isSuperuser } = usePermissions();
  const { run, dialogs } = useRecordActions();

  const kind = parseKind(params.get("kind"));
  const tl = Number(params.get("tl")) || null;
  const month = params.get("month") ?? "";
  const isStaff = isAdmin || isSuperuser;
  // An HBPR has no team of their own: they read one in-scope team leader's records at a time.
  const pickTl = isHBPR && !isTeamLeader && !isStaff;
  const waitingForTl = pickTl && tl === null;
  const viewer: Viewer = { userId: user?.id ?? null, isStaff, canReview: isHBPR || isStaff };

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const results = useQueries({
    queries: RECORD_CONFIGS.map((config) => ({
      // Lists are fetched once per kind; team leader and month narrow them client-side.
      queryKey: ["tl-scorecard", "records", config.key],
      queryFn: config.fetch,
      enabled: !waitingForTl,
    })),
  });

  const narrow = (index: number): RecordRow[] | undefined => {
    const config = RECORD_CONFIGS[index];
    return results[index].data?.filter(
      (row) =>
        (!pickTl || config.ownerId(row) === tl) && (!month || config.date(row).startsWith(month.slice(0, 7))),
    );
  };

  const activeIndex = RECORD_CONFIGS.findIndex((config) => config.key === kind);
  const activeRows = narrow(activeIndex);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {pickTl && (
          <div className="w-full sm:w-64">
            <Label htmlFor="records-tl">Team leader</Label>
            <TlPicker id="records-tl" value={tl} onChange={(id) => setParam("tl", String(id))} />
          </div>
        )}
        <div>
          <Label htmlFor="records-month">Month</Label>
          <Input
            id="records-month"
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setParam("month", e.target.value ? `${e.target.value}-01` : null)}
          />
        </div>
      </div>

      {waitingForTl ? (
        <EmptyState icon={Users} title="Pick a team leader" description="Records are shown for one team leader at a time." className="py-10" />
      ) : (
        <Tabs
          value={kind}
          onValueChange={(value) => setParam("kind", value)}
          orientation="vertical"
          className="grid gap-4 lg:grid-cols-[14rem_1fr]"
        >
          <div>
            <div className="lg:hidden">
              <Label htmlFor="records-kind">Record type</Label>
              <Select value={kind} onValueChange={(value) => setParam("kind", value)}>
                <SelectTrigger id="records-kind">
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
            <TabsList
              aria-label="Record types"
              className="hidden h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0 lg:flex"
            >
              {RECORD_CONFIGS.map((config, index) => (
                <TabsTrigger key={config.key} value={config.key} className="min-h-9 justify-between px-3">
                  {config.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{narrow(index)?.length ?? ""}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={kind} className="mt-0 min-w-0">
            <RecordListPanel
              config={RECORD_CONFIGS[activeIndex]}
              rows={activeRows}
              totalCount={results[activeIndex].data?.length ?? 0}
              isLoading={results[activeIndex].isLoading}
              error={results[activeIndex].error}
              onRetry={() => void results[activeIndex].refetch()}
              viewer={viewer}
              onAction={(action, record) => run(action, RECORD_CONFIGS[activeIndex], record)}
            />
          </TabsContent>
        </Tabs>
      )}
      {dialogs}
    </div>
  );
};
