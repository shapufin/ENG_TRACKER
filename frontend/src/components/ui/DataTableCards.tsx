import React from "react";
import { flexRender } from "@tanstack/react-table";
import { Checkbox } from "./checkbox";
import { EmptyState } from "./EmptyState";
import { Search } from "lucide-react";
import type { AppRow } from "./tableTypes";

/** One below Tailwind's `md` (768px): phones and small tablets in portrait get cards. */
export const MOBILE_CARD_QUERY = "(max-width: 767px)"; // ds-allow-hardcode: must match Tailwind md

/** Which columns fill which part of a card. Ids are column ids (`accessorKey` or `id`). */
export interface DataTableCardSpec {
  /** Main line, e.g. the client or project. */
  title: string;
  /** Large right-aligned figure, e.g. hours or days. */
  hero?: string;
  /** Status badge shown beside the title block. */
  status?: string;
  /** Secondary "label: value" lines, in order. Labels come from the column header. */
  meta?: string[];
  /** Action column rendered as the card footer. Defaults to "actions". */
  actions?: string;
}

interface DataTableCardsProps<TData extends object> {
  rows: AppRow<TData>[];
  spec: DataTableCardSpec;
  emptyMessage: string;
  enableRowSelection?: boolean;
  allSelected?: boolean;
  onToggleAll?: (value: boolean) => void;
  onRowClick?: (row: TData) => void;
}

const headerText = (header: unknown, fallback: string) =>
  typeof header === "string" ? header : fallback;

/**
 * Phone layout for a DataTable: every row becomes a card whose parts are the
 * SAME cell renderers the table uses (badges, hours blocks, row actions), so
 * permissions, locks and formatting cannot drift between the two layouts.
 */
export const DataTableCards = <TData extends object>({
  rows,
  spec,
  emptyMessage,
  enableRowSelection,
  allSelected,
  onToggleAll,
  onRowClick,
}: DataTableCardsProps<TData>) => {
  if (!rows.length) return <EmptyState icon={Search} title={emptyMessage} />;

  const actionsId = spec.actions ?? "actions";

  return (
    <div>
      {enableRowSelection && onToggleAll && (
        <label className="border-border/50 flex min-h-11 items-center gap-3 border-b px-4 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(value) => onToggleAll(Boolean(value))}
            aria-label="Select all rows on this page"
          />
          Select all
        </label>
      )}
      <ul className="divide-border/50 divide-y">
        {rows.map((row) => {
          const cells = row.getVisibleCells();
          const render = (id: string | undefined) => {
            const cell = id ? cells.find((c) => c.column.id === id) : undefined;
            return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
          };
          const titleText = String((row.original as Record<string, unknown>)[spec.title] ?? row.id);
          const actions = render(actionsId);
          return (
            <li
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="data-[state=selected]:bg-muted/40 flex gap-3 px-4 py-3"
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {enableRowSelection && (
                <Checkbox
                  className="relative mt-1 shrink-0 after:absolute after:-inset-3.5"
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${titleText}`}
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm font-medium break-words">
                    {render(spec.title)}
                  </div>
                  <div className="shrink-0">{render(spec.hero)}</div>
                </div>
                {spec.status && <div>{render(spec.status)}</div>}
                {spec.meta && (
                  <dl className="text-muted-foreground space-y-0.5 text-xs">
                    {spec.meta.map((id) => {
                      const cell = cells.find((c) => c.column.id === id);
                      if (!cell) return null;
                      return (
                        <div key={id} className="flex gap-2">
                          <dt className="shrink-0">
                            {headerText(cell.column.columnDef.header, id)}
                          </dt>
                          <dd className="text-foreground min-w-0 break-words">{render(id)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {actions && (
                  // No hover state on touch: keep icon buttons visible and 44px.
                  <div className="flex items-center justify-end [&_button]:min-h-11 [&_button]:min-w-11 [&>div]:opacity-100">
                    {actions}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
