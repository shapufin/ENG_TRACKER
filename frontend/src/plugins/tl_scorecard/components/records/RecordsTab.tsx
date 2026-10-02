import React from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
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
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";
import { RecordListPanel } from "./RecordListPanel";
import { parseKind, RECORD_CONFIGS, type RecordRow, type Viewer } from "./recordKinds";
import { useRecordActions } from "./useRecordActions";

/**
 * The Albanian TL's record register. HBPR has no picker here: it is read-only
 * over this data and reads it in its own `/hbpr` workspace instead.
 */
export const RecordsTab: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { isAdmin, isSuperuser } = usePermissions();
  const { run, dialogs } = useRecordActions();

  const kind = parseKind(params.get("kind"));
  const month = params.get("month") ?? "";
  const isStaff = isAdmin || isSuperuser;
  // Approving a PIP / deciding a promotion is staff-only on the API.
  const viewer: Viewer = { userId: user?.id ?? null, isStaff, canReview: isStaff };

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  const results = useQueries({
    queries: RECORD_CONFIGS.map((config) => ({
      // Lists are fetched once per kind; the month narrows them client-side.
      queryKey: ["tl-scorecard", "records", config.key],
      queryFn: config.fetch,
    })),
  });

  const narrow = (index: number): RecordRow[] | undefined => {
    const config = RECORD_CONFIGS[index];
    return results[index].data?.filter(
      (row) => !month || config.date(row).startsWith(month.slice(0, 7))
    );
  };

  const activeIndex = RECORD_CONFIGS.findIndex((config) => config.key === kind);
  const activeRows = narrow(activeIndex);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
              <TabsTrigger
                key={config.key}
                value={config.key}
                className="min-h-9 justify-between px-3"
              >
                {config.label}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {narrow(index)?.length ?? ""}
                </span>
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
      {dialogs}
    </div>
  );
};
