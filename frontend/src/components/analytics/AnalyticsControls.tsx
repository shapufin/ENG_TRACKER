import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Settings, ChevronDown, Download } from "lucide-react";
import type { Period } from "@/pages/analytics/hooks/useAnalyticsPage";

interface AnalyticsControlsProps {
  periods: readonly Period[];
  selectedPeriod: Period;
  onPeriodChange: (period: Period) => void;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  exportFormat: "excel" | "csv";
  onExportFormatChange: (format: "excel" | "csv") => void;
  /** Export callback. When undefined, the Export button + format selector are hidden. */
  onExport?: () => void;
  /** Settings callback. When undefined, the Settings button is hidden. */
  onOpenSettings?: () => void;
}

export const AnalyticsControls: React.FC<AnalyticsControlsProps> = ({
  periods,
  selectedPeriod,
  onPeriodChange,
  dateRange,
  onDateRangeChange,
  showFilters,
  onToggleFilters,
  activeFilterCount,
  exportFormat,
  onExportFormatChange,
  onExport,
  onOpenSettings,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {periods.map((period) => (
          <Button
            key={period}
            variant={selectedPeriod === period ? "default" : "outline"}
            size="sm"
            onClick={() => onPeriodChange(period)}
            className="capitalize"
          >
            {period}
          </Button>
        ))}
      </div>

      {selectedPeriod === "custom" && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
            className="h-8 w-36 text-xs"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
            className="h-8 w-36 text-xs"
          />
        </div>
      )}

      <Button
        variant={showFilters ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleFilters}
        className="gap-2"
      >
        <Filter className="h-4 w-4" />
        {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Advanced Filters"}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`}
        />
      </Button>
    </div>

    <div className="flex items-center gap-2">
      {onExport && (
        <>
          <Select
            value={exportFormat}
            onValueChange={(v) => onExportFormatChange(v as "excel" | "csv")}
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-8 gap-2" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </>
      )}
      {onOpenSettings && (
        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      )}
    </div>
  </div>
);
