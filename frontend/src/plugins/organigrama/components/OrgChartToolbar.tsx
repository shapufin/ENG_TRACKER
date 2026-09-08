/** Toolbar for the org chart — search, expand/collapse all, zoom controls. */
import React from "react";
import { Search, ChevronsDownUp, ChevronsUpDown, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OrgChartToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

export const OrgChartToolbar: React.FC<OrgChartToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  onZoomIn,
  onZoomOut,
  onFitView,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or tech code..."
          className="pl-8"
          aria-label="Search organizational chart"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onExpandAll}
          aria-label="Expand all nodes"
          title="Expand all"
        >
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCollapseAll}
          aria-label="Collapse all nodes"
          title="Collapse all"
        >
          <ChevronsDownUp className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="outline" size="sm" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFitView}
          aria-label="Fit view to screen"
          title="Fit view"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
