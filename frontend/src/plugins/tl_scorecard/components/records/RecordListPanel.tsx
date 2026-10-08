import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Eye, MoreHorizontal, ScrollText, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import { isForbidden } from "../hbpr/isForbidden";
import { NoAccess } from "../hbpr/NoAccess";
import { PageNav } from "../hbpr/PageNav";
import { avatarSeed } from "../avatarSeed";
import { StateBadge } from "./StateBadge";
import {
  ACTION_LABELS,
  type KindConfig,
  type RecordActionId,
  type RecordRow,
  type Viewer,
} from "./recordKinds";

interface RecordSnippet {
  person: string;
  focus: string;
}

interface RecordListPanelProps {
  config: KindConfig<RecordRow>;
  /** Current page slice. */
  rows: RecordRow[];
  /** Filtered rows across all pages (for counts, pagination and the snippet). */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  latest: { row: RecordRow; snippet: RecordSnippet } | null;
  /** Clears the month filter to show the full history of this kind. */
  historyHref: string;
  /** Rows before every filter, to tell "no records" from "no match". */
  totalCount: number;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  viewer: Viewer;
  onAction: (action: RecordActionId, record: RecordRow) => void;
  /** Opens the full record detail dialog (row click, Enter key or the eye button). */
  onView: (record: RecordRow) => void;
}

const RowActions: React.FC<{
  title: string;
  actions: RecordActionId[];
  onPick: (action: RecordActionId) => void;
}> = ({ title, actions, onPick }) => {
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${title}`}
          className="h-11 w-11 sm:h-9 sm:w-9"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <ul>
          {actions.map((action) => (
            <li key={action}>
              <button
                type="button"
                className={`hover:bg-accent focus-visible:bg-accent flex min-h-11 w-full items-center rounded-sm px-3 text-left text-sm focus-visible:outline-hidden sm:min-h-9 ${
                  action === "delete" ? "text-tone-danger-text" : ""
                }`}
                onClick={() => {
                  setOpen(false);
                  onPick(action);
                }}
              >
                {ACTION_LABELS[action]}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

const Skeleton: React.FC<{ label: string }> = ({ label }) => (
  <div aria-busy="true" className="space-y-2">
    <span className="sr-only">Loading {label}...</span>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-muted/40 h-12 animate-pulse rounded-lg border" />
    ))}
  </div>
);

const cellClass =
  "max-md:before:text-muted-foreground px-4 py-2.5 max-md:flex max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-0.5 max-md:before:text-xs max-md:before:content-[attr(data-label)]";

export const RecordListPanel: React.FC<RecordListPanelProps> = ({
  config,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  latest,
  historyHref,
  totalCount,
  isLoading,
  error,
  onRetry,
  viewer,
  onAction,
  onView,
}) => {
  if (isLoading) return <Skeleton label={config.label.toLowerCase()} />;
  if (error) {
    return isForbidden(error) ? (
      <NoAccess />
    ) : (
      <ErrorCard title={`Could not load ${config.label.toLowerCase()}`} onRetry={onRetry} />
    );
  }
  if (total === 0) {
    return totalCount === 0 ? (
      <EmptyState
        icon={ClipboardList}
        title="No records yet"
        description={`${config.label} you register will show up here.`}
        className="py-10"
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="No match"
        description="Try another month or search."
        className="py-10"
      />
    );
  }

  return (
    <GlassCard animateOnMount={false} className="overflow-hidden p-0">
      <div className="border-line-subtle flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-foreground flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
          {config.label} Records
          <span className="bg-tone-success-text h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        </h2>
        <span className="text-muted-foreground text-xs">
          Showing {rows.length} of {total} records
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm max-md:block">
          <caption className="sr-only">{config.label}</caption>
          <thead className="max-md:sr-only">
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                Date
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                Type
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                With
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                Focus / Notes preview
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                State
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "py-2")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/50 divide-y max-md:block">
            {rows.map((record) => {
              const state = config.state(record);
              const person = config.person(record);
              const focus = config.focus(record);
              return (
                <tr
                  key={record.id}
                  tabIndex={0}
                  onClick={() => onView(record)}
                  onKeyDown={(e) => {
                    // The eye and ⋯ buttons handle their own keys; only a key
                    // pressed on the row itself opens the record.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onView(record);
                    }
                  }}
                  className="hover:bg-muted/40 cursor-pointer max-md:block max-md:space-y-1 max-md:px-4 max-md:py-3"
                >
                  <td
                    data-label="Date"
                    className={`${cellClass} font-mono text-xs whitespace-nowrap`}
                  >
                    {config.date(record)}
                  </td>
                  <td data-label="Type" className={cellClass}>
                    <Badge variant="neutral" className="whitespace-nowrap">
                      {config.typeChip(record)}
                    </Badge>
                  </td>
                  <td data-label="With" className={cellClass}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={person} size="sm" colorSeed={avatarSeed(person)} />
                      <span className="max-w-[10rem] truncate font-medium" title={person}>
                        {person}
                      </span>
                    </div>
                  </td>
                  <td data-label="Focus" className={cellClass}>
                    {focus ? (
                      <span className="text-muted-foreground block max-w-xs truncate" title={focus}>
                        {focus}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td data-label="State" className={cellClass}>
                    <StateBadge {...state} />
                  </td>
                  <td
                    className="px-4 py-1 text-right max-md:px-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`View details of ${config.title(record)}`}
                        className="h-11 w-11 sm:h-9 sm:w-9"
                        onClick={() => onView(record)}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <RowActions
                        title={config.title(record)}
                        actions={config.actions(record, viewer)}
                        onPick={(action) => onAction(action, record)}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {latest && (
        <div className="border-line-subtle bg-muted/40 flex flex-col gap-3 border-t px-5 py-4 text-xs md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="border-border bg-card text-muted-foreground rounded-md border p-1">
              <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-foreground font-bold">
                Latest {config.noun} ({latest.snippet.person}):
              </p>
              <p
                className="text-muted-foreground mt-0.5 line-clamp-2 italic"
                title={latest.snippet.focus}
              >
                &ldquo;{latest.snippet.focus}&rdquo;
              </p>
            </div>
          </div>
          <Link
            to={historyHref}
            className="text-primary inline-flex min-h-6 shrink-0 items-center font-semibold"
          >
            View full {config.noun} history →
          </Link>
        </div>
      )}
      <div className="border-line-subtle border-t px-5 py-3">
        <PageNav
          page={page}
          pageSize={pageSize}
          total={total}
          noun="records"
          onPageChange={onPageChange}
        />
      </div>
    </GlassCard>
  );
};
