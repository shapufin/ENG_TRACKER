/** Toolbar for the org chart — search, expand/collapse all, zoom controls, 3D spatial toggle, export. */
import React from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Box,
  Download,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { cn } from "@/lib/utils";

export interface OrgChartToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  is3D?: boolean;
  onToggle3D?: () => void;
  onExportPng?: () => void;
  onSwitchToList?: () => void;
}

export const OrgChartToolbar: React.FC<OrgChartToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  onZoomIn,
  onZoomOut,
  onFitView,
  is3D,
  onToggle3D,
  onExportPng,
  onSwitchToList,
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

        {onToggle3D && (
          <>
            <div className="bg-border mx-1 h-5 w-px" />
            <Button
              variant={is3D ? "default" : "outline"}
              size="control-sm"
              onClick={onToggle3D}
              aria-label={is3D ? "Switch to 2D view" : "Switch to 3D perspective view"}
              title={is3D ? "3D View Active (Click for 2D)" : "3D Spatial Perspective"}
              className={cn(is3D && "shadow-xs")}
            >
              <Box className="h-4 w-4" />
              <span className="ml-1 text-xs font-semibold">3D</span>
            </Button>
          </>
        )}

        {onExportPng && (
          <Button
            variant="outline"
            size="control-sm"
            onClick={onExportPng}
            aria-label="Export chart image"
            title="Export as PNG"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}

        {onSwitchToList && (
          <>
            <div className="bg-border mx-1 h-5 w-px" />
            <Button
              variant="outline"
              size="control-sm"
              onClick={onSwitchToList}
              aria-label="Switch to list view"
              title="Switch to List View"
              className="gap-1 px-2 text-xs"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </>
        )}
      </div>
    </FilterToolbar>
  );
};
