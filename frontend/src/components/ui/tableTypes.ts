/**
 * Shared @tanstack/react-table v9 feature set and type aliases.
 *
 * v9 makes `TFeatures` the first generic of every table type and requires the
 * `features` table option. `DataTable` is the only table in the app, so the
 * feature set lives here once (module scope keeps the reference stable) and
 * every column file uses the `App*` aliases instead of spelling
 * `ColumnDef<typeof appFeatures, …>` itself.
 */
import {
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type Cell,
  type CellContext,
  type Column,
  type ColumnDef,
  type Row,
  type RowData,
  type Table,
} from "@tanstack/react-table";

export const appFeatures = tableFeatures({
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});

export type AppFeatures = typeof appFeatures;
export type AppColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<AppFeatures, TData, TValue>;
export type AppColumn<TData extends RowData, TValue = unknown> = Column<AppFeatures, TData, TValue>;
export type AppRow<TData extends RowData> = Row<AppFeatures, TData>;
export type AppCell<TData extends RowData, TValue = unknown> = Cell<AppFeatures, TData, TValue>;
export type AppCellContext<TData extends RowData, TValue = unknown> = CellContext<AppFeatures, TData, TValue>;
export type AppTable<TData extends RowData> = Table<AppFeatures, TData>;
