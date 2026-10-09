/** Toolbar for the org chart — search, expand/collapse all, zoom controls. */
import React from "react";
import { ChevronsDownUp, ChevronsUpDown, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";

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
    <FilterToolbar className="bg-card rounded-lg border p-2 shadow-sm">
      <FilterToolbar.Search>
        <SearchField
          controlSize="sm"
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search by name or tech code..."
          aria-label="Search organizational chart"
        />
      </FilterToolbar.Search>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="control-sm"
          onClick={onExpandAll}
          aria-label="Expand all nodes"
          title="Expand all"
        >
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="control-sm"
          onClick={onCollapseAll}
          aria-label="Collapse all nodes"
          title="Collapse all"
        >
          <ChevronsDownUp className="h-4 w-4" />
        </Button>
        <div className="bg-border mx-1 h-5 w-px" />
        <Button
          variant="outline"
          size="control-sm"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="control-sm"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="control-sm"
          onClick={onFitView}
          aria-label="Fit view to screen"
          title="Fit view"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </FilterToolbar>
  );
};
