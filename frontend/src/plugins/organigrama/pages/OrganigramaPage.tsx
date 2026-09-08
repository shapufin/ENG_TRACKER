/** Organigrama page — route entry, source selector, mobile/desktop switch. */
import React, { useMemo, useState } from "react";
import { Network, Loader2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useOrganigramaTree,
  useOrganigramaVisibleCharts,
  useOrganigramaPublished,
} from "../hooks/useOrganigramaQueries";
import { OrgChartPage } from "../components/OrgChartPage";
import { OrgChartMobileList } from "../components/OrgChartMobileList";
import { CustomChartViewer } from "../components/CustomChartViewer";
import type { OrgChart } from "../types";

type SourceOption = { id: "live" | number; label: string };

export const OrganigramaPage: React.FC = () => {
  const tree = useOrganigramaTree();
  const visible = useOrganigramaVisibleCharts();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const sources = useMemo<SourceOption[]>(() => {
    const list: SourceOption[] = [];
    if (tree.data) {
      list.push({ id: "live", label: "Live company chart" });
    }
    if (visible.data) {
      for (const chart of visible.data) {
        list.push({ id: chart.id, label: chart.name });
      }
    }
    return list;
  }, [tree.data, visible.data]);

  const [userSelection, setUserSelection] = useState<"live" | number | null>(null);

  const selectedId = useMemo<"live" | number>(() => {
    const current = sources.find((s) => s.id === userSelection);
    if (current) return userSelection as "live" | number;
    if (tree.data && tree.data.roots.length > 0) return "live";
    if (visible.data && visible.data.length > 0) return visible.data[0].id;
    return "live";
  }, [userSelection, sources, tree.data, visible.data]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedId) ?? sources[0],
    [sources, selectedId]
  );

  const chartId = selectedId !== "live" ? selectedId : null;
  const selectedChart = useMemo<OrgChart | undefined>(() => {
    if (chartId === null) return undefined;
    return visible.data?.find((c) => c.id === chartId);
  }, [chartId, visible.data]);

  const published = useOrganigramaPublished(chartId);

  const isLoading = tree.isLoading || visible.isLoading || published.isLoading;
  const isError = tree.isError || visible.isError || published.isError;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load organizational chart.</p>
      </div>
    );
  }

  const renderContent = () => {
    if (selectedId === "live") {
      if (!tree.data || tree.data.roots.length === 0) {
        return (
          <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-2">
            <Network className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No organizational data available.</p>
          </div>
        );
      }
      return isMobile ? (
        <OrgChartMobileList roots={tree.data.roots} />
      ) : (
        <OrgChartPage roots={tree.data.roots} />
      );
    }

    if (published.data && selectedChart) {
      return <CustomChartViewer chart={selectedChart} payload={published.data} />;
    }

    return null;
  };

  const headerLabel =
    selectedId === "live" ? "Organigrama" : (selectedSource?.label ?? "Organigrama");
  const headerSubtitle =
    selectedId === "live" && tree.data
      ? `${tree.data.total_nodes} nodes · scope: ${tree.data.scope}`
      : selectedChart
        ? `${selectedChart.node_count} nodes · published`
        : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 border-b border-line-subtle pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{headerLabel}</h1>
          {headerSubtitle && <p className="text-sm text-muted-foreground">{headerSubtitle}</p>}
        </div>
        {sources.length > 1 && (
          <Select
            value={selectedId === "live" ? "live" : selectedId.toString()}
            onValueChange={(value) => {
              if (value === "live") {
                setUserSelection("live");
              } else {
                const id = parseInt(value, 10);
                if (!Number.isNaN(id)) setUserSelection(id);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Select chart source">
              <SelectValue placeholder="Select a chart" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id === "live" ? "live" : s.id.toString()}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {renderContent()}
    </div>
  );
};
