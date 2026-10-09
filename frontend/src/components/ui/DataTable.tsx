import React, { useMemo } from "react";
import {
  useTable,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
  type ColumnVisibilityState,
  type RowData,
  type Updater,
} from "@tanstack/react-table";
import { appFeatures, type AppCell, type AppColumnDef, type AppRow } from "./tableTypes";
import {
  TABLE_BODY_CELL_CLASS,
  TABLE_HEAD_CELL_CHECKBOX_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
} from "./tableStyles";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { FilterToolbar } from "./FilterToolbar";
import { SearchField } from "./SearchField";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import { EmptyState } from "./EmptyState";

interface DataTableProps<TData extends RowData> {
  columns: AppColumnDef<TData, unknown>[];
  data: TData[];
  /** Column path(s) the global search matches. Nested paths use dot notation
   * ("user.username"); an array matches ANY listed path. Omit to search every
   * primitive cell value. */
  searchColumn?: string | string[];
  searchPlaceholder?: string;
  /** Seeds the search box once on mount (e.g. from a ?q= deep link). */
  initialSearch?: string;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowClassName?: (row: TData) => string;
  pageSize?: number;
  onRowMouseEnter?: (row: TData) => void;
  onRowMouseLeave?: (row: TData) => void;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  enableColumnVisibility?: boolean;
  columnVisibility?: Record<string, boolean>;
  onColumnVisibilityChange?: (visibility: Record<string, boolean>) => void;
  storageKey?: string;
  getRowId?: (row: TData, index: number) => string;
  /** Extra toolbar controls (e.g. a filter Chip) rendered between the search and Columns. */
  toolbarActions?: React.ReactNode;
}

// fallow-ignore-next-line complexity
export const DataTable = function DataTable<TData extends RowData>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Search...",
  initialSearch,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  getRowClassName,
  pageSize = 50,
  onRowMouseEnter,
  onRowMouseLeave,
  onRowClick,
  emptyMessage = "No results found.",
  enableColumnVisibility = false,
  columnVisibility: externalColumnVisibility,
  onColumnVisibilityChange,
  storageKey,
  getRowId,
  toolbarActions,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch ?? "");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = React.useState(false);
  const [showRightShadow, setShowRightShadow] = React.useState(false);

  // Initialize column visibility from localStorage or external prop
  const [internalColumnVisibility, setInternalColumnVisibility] = React.useState<
    Record<string, boolean>
  >(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Check if the saved state has a version key; if not, it's old format
          if (!parsed._version) {
            // Clear old format visibility state
            localStorage.removeItem(storageKey);
            return {};
          }
          // Remove metadata before returning the column visibility map.
          const visibility = { ...parsed };
          delete (visibility as { _version?: unknown })._version;
          return visibility;
        } catch {
          return {};
        }
      }
    }
    return {};
  });

  const columnVisibility = externalColumnVisibility ?? internalColumnVisibility;

  const handleColumnVisibilityChange = React.useCallback(
    (updaterOrValue: Updater<ColumnVisibilityState>) => {
      const newVisibility =
        typeof updaterOrValue === "function" ? updaterOrValue(columnVisibility) : updaterOrValue;
      if (onColumnVisibilityChange) {
        onColumnVisibilityChange(newVisibility);
      } else {
        setInternalColumnVisibility(newVisibility);
      }
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify({ _version: 1, ...newVisibility }));
      }
    },
    [onColumnVisibilityChange, storageKey, columnVisibility]
  );

  const searchPaths = React.useMemo(
    () => (Array.isArray(searchColumn) ? searchColumn : searchColumn ? [searchColumn] : []),
    [searchColumn]
  );

  const globalFilterFn = React.useCallback(
    // fallow-ignore-next-line complexity
    (row: AppRow<TData>, _columnId: string, filterValue: unknown) => {
      const needle = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!needle) return true;

      if (searchPaths.length > 0) {
        return searchPaths.some((path) => {
          // Handle nested paths like "user.username"
          let value: unknown = row.original;
          for (const key of path.split(".")) {
            value = (value as Record<string, unknown>)?.[key];
            if (value === undefined || value === null) break;
          }
          return String(value ?? "")
            .toLowerCase()
            .includes(needle);
        });
      }

      // fallow-ignore-next-line complexity
      return row.getAllCells().some((cell: AppCell<TData, unknown>) => {
        const value = cell.getValue();
        // Skip complex objects/arrays to avoid "[Object object]" strings
        if (value === null || value === undefined) return false;
        if (typeof value === "object") return false;
        if (Array.isArray(value)) return false;
        return String(value).toLowerCase().includes(needle);
      });
    },
    [searchPaths]
  );

  const table = useTable({
    features: appFeatures,
    data,
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    globalFilterFn,
    enableRowSelection,
    enableHiding: true,
    enableSorting: true,
    getRowId,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const rows = table.getRowModel().rows;

  // Memoize rendered rows; recompute when the row model, selection, OR column
  // visibility changes. `rows` reference is stable across pure selection and
  // pure visibility changes (data/sort/filter unchanged), so `rowSelection` and
  // `columnVisibility` MUST be in deps or checkboxes stay stale and hidden
  // columns stay visible until a page refresh.
  // The exhaustive-deps linter falsely flags these as "unnecessary" because it
  // cannot see through TanStack's row.getIsSelected() / row.getVisibleCells()
  // closures.
  /* eslint-disable react-hooks/exhaustive-deps */
  const renderedRows = useMemo(() => {
    return rows.map((row) => {
      const isSelected = enableRowSelection ? row.getIsSelected() : false;
      return (
        <tr
          key={row.id}
          data-state={isSelected ? "selected" : undefined}
          className={cn(
            "focus-visible:ring-ring/60 transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
            isSelected && "bg-primary/10",
            onRowClick && "cursor-pointer",
            getRowClassName ? getRowClassName(row.original) : "hover:bg-table-hover"
          )}
          tabIndex={onRowClick ? 0 : undefined}
          onMouseEnter={() => onRowMouseEnter?.(row.original)}
          onMouseLeave={() => onRowMouseLeave?.(row.original)}
          onClick={() => onRowClick?.(row.original)}
          onKeyDown={(event) => {
            if (onRowClick && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onRowClick(row.original);
            }
          }}
        >
          {enableRowSelection && (
            <td className="w-10 px-4 py-3 text-center align-middle">
              <Checkbox
                checked={isSelected}
                onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
                aria-label="Select row"
              />
            </td>
          )}
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              className={TABLE_BODY_CELL_CLASS}
              style={
                cell.column.columnDef.size
                  ? { width: cell.column.columnDef.size, maxWidth: cell.column.columnDef.size }
                  : undefined
              }
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      );
    });
  }, [
    rows,
    // rowSelection is required: the `rows` array reference is stable across
    // pure selection changes, but row.getIsSelected() returns a new value.
    // Without this dep, checkboxes and row highlights stay stale after toggle.
    rowSelection,
    // columnVisibility is required: the `rows` array reference is stable across
    // pure visibility toggles, but row.getVisibleCells() returns a new set.
    // Without this dep, hidden columns stay visible until a page refresh.
    columnVisibility,
    // columns is required: when column cell functions change (e.g. async data
    // loads into a closure captured by useUserColumns), the `rows` reference
    // stays the same but flexRender must re-execute with the new cell fns.
    // Without this dep, cells render stale content from the old closure.
    columns,
    getRowClassName,
    onRowMouseEnter,
    onRowMouseLeave,
    onRowClick,
    enableRowSelection,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const updateScrollShadows = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftShadow(el.scrollLeft > 8);
    setShowRightShadow(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollShadows();
    el.addEventListener("scroll", updateScrollShadows, { passive: true });
    const ro = new ResizeObserver(updateScrollShadows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollShadows);
      ro.disconnect();
    };
  }, [updateScrollShadows]);

  const totalCols = columns.length + (enableRowSelection ? 1 : 0);

  return (
    <div className="space-y-4">
      {(searchPaths.length > 0 || enableColumnVisibility || toolbarActions) && (
        <FilterToolbar className="pb-1">
          {searchPaths.length > 0 && (
            <FilterToolbar.Search>
              <SearchField
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={setGlobalFilter}
                aria-label={searchPlaceholder.replace(/[.…\s]+$/, "")}
              />
            </FilterToolbar.Search>
          )}
          {toolbarActions}
          {enableColumnVisibility && (
            <ColumnVisibilityMenu
              columns={columns}
              visibility={columnVisibility}
              onVisibilityChange={(v) => handleColumnVisibilityChange(v)}
            />
          )}
        </FilterToolbar>
      )}

      {/* Scroll wrapper with shadow indicators */}
      <div className="relative">
        {showLeftShadow && (
          <div className="from-card pointer-events-none absolute inset-y-0 left-0 z-10 w-8 rounded-l-md bg-linear-to-r to-transparent" />
        )}
        {showRightShadow && (
          <div className="from-card pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-md bg-linear-to-l to-transparent" />
        )}
        <div
          ref={scrollRef}
          className="border-border/70 bg-background/20 overflow-x-auto rounded-xl border"
        >
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                {enableRowSelection && (
                  <th className={TABLE_HEAD_CELL_CHECKBOX_CLASS}>
                    <Checkbox
                      checked={table.getIsAllPageRowsSelected()}
                      onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                )}
                {table.getHeaderGroups().flatMap((hg) =>
                  // fallow-ignore-next-line complexity
                  hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={TABLE_HEAD_CELL_CLASS}
                      style={
                        header.column.columnDef.size
                          ? { width: header.column.columnDef.size }
                          : undefined
                      }
                      aria-sort={
                        header.column.getCanSort()
                          ? header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="focus-visible:ring-focus flex min-h-11 items-center gap-1 rounded-sm transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:outline-hidden"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${header.column.id}`}
                          title={`Sort by ${header.column.id}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ml-0.5 shrink-0">
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">
              {rows.length ? (
                renderedRows
              ) : (
                <tr>
                  <td colSpan={totalCols}>
                    <EmptyState icon={Search} title={emptyMessage} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-muted-foreground text-xs">
          {table.getFilteredRowModel().rows.length} result
          {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
          {table.getPageCount() > 1 &&
            ` · Page ${table.state.pagination.pageIndex + 1} of ${table.getPageCount()}`}
        </p>
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
