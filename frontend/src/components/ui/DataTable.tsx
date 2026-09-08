import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
  type Row,
  type Cell,
  type VisibilityState,
  type Updater,
} from "@tanstack/react-table";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
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

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  searchColumn?: string;
  searchPlaceholder?: string;
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
}

// fallow-ignore-next-line complexity
export const DataTable = function DataTable<TData>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Search...",
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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
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

  // Initialize visibility state with all columns visible if empty
  React.useEffect(() => {
    if (Object.keys(columnVisibility).length === 0 && columns.length > 0) {
      const defaultVisibility: Record<string, boolean> = {};
      columns.forEach((col) => {
        const typedCol = col as { id?: string; accessorKey?: string };
        const columnId = typedCol.id || typedCol.accessorKey;
        if (columnId && columnId !== "select") {
          defaultVisibility[columnId] = true;
        }
      });
      setInternalColumnVisibility(defaultVisibility);
    }
  }, [columns, columnVisibility]);
  const handleColumnVisibilityChange = React.useCallback(
    (updaterOrValue: Updater<VisibilityState>) => {
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

  const globalFilterFn = React.useCallback(
    // fallow-ignore-next-line complexity
    (row: Row<TData>, _columnId: string, filterValue: unknown) => {
      const needle = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!needle) return true;

      if (searchColumn) {
        // Handle nested paths like "user.username"
        const path = searchColumn.split(".");
        let value: unknown = row.original;
        for (const key of path) {
          value = (value as Record<string, unknown>)?.[key];
          if (value === undefined || value === null) break;
        }
        const strValue = String(value ?? "").toLowerCase();
        return strValue.includes(needle);
      }

      // fallow-ignore-next-line complexity
      return row.getAllCells().some((cell: Cell<TData, unknown>) => {
        const value = cell.getValue();
        // Skip complex objects/arrays to avoid "[Object object]" strings
        if (value === null || value === undefined) return false;
        if (typeof value === "object") return false;
        if (Array.isArray(value)) return false;
        return String(value).toLowerCase().includes(needle);
      });
    },
    [searchColumn]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection,
    enableHiding: true,
    enableSorting: true,
    getRowId,
    initialState: { pagination: { pageSize } },
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
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
            isSelected && "bg-primary/10",
            getRowClassName ? getRowClassName(row.original) : "hover:bg-muted/40"
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
              className="px-4 py-3 align-middle"
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
      {(searchColumn || enableColumnVisibility) && (
        <div className="flex flex-wrap items-center gap-3 pb-1">
          {searchColumn && (
            <div className="relative w-full max-w-sm flex-1 sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                aria-label={searchPlaceholder}
                className="h-11 pl-9 sm:h-9"
              />
            </div>
          )}
          {enableColumnVisibility && (
            <ColumnVisibilityMenu
              columns={columns}
              visibility={columnVisibility}
              onVisibilityChange={(v) => handleColumnVisibilityChange(v)}
            />
          )}
        </div>
      )}

      {/* Scroll wrapper with shadow indicators */}
      <div className="relative">
        {showLeftShadow && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 rounded-l-md bg-gradient-to-r from-card to-transparent" />
        )}
        {showRightShadow && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-md bg-gradient-to-l from-card to-transparent" />
        )}
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-xl border border-border/70 bg-background/20"
        >
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/90 backdrop-blur-sm">
                {enableRowSelection && (
                  <th className="w-10 px-4 py-3 text-left">
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
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
                          className="flex min-h-11 items-center gap-1 transition-colors hover:text-foreground"
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
            <tbody className="divide-y divide-border/50">
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
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} result
          {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
          {table.getPageCount() > 1 &&
            ` · Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`}
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
