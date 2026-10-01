import React, { useState } from "react";
import { ClipboardList, MoreHorizontal, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isForbidden } from "../hbpr/isForbidden";
import { NoAccess } from "../hbpr/NoAccess";
import { StateBadge } from "./StateBadge";
import {
  ACTION_LABELS,
  type KindConfig,
  type RecordActionId,
  type RecordRow,
  type Viewer,
} from "./recordKinds";

interface RecordListPanelProps {
  config: KindConfig<RecordRow>;
  rows: RecordRow[] | undefined;
  /** Rows before the month / team-leader filters, to tell "no records" from "no match". */
  totalCount: number;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  viewer: Viewer;
  onAction: (action: RecordActionId, record: RecordRow) => void;
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
        <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} className="h-11 w-11 sm:h-9 sm:w-9">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <ul>
          {actions.map((action) => (
            <li key={action}>
              <button
                type="button"
                className={`flex min-h-11 w-full items-center rounded-sm px-3 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden sm:min-h-9 ${
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
      <div key={i} className="h-12 animate-pulse rounded-lg border bg-muted/40" />
    ))}
  </div>
);

export const RecordListPanel: React.FC<RecordListPanelProps> = ({
  config,
  rows,
  totalCount,
  isLoading,
  error,
  onRetry,
  viewer,
  onAction,
}) => {
  if (isLoading) return <Skeleton label={config.label.toLowerCase()} />;
  if (error) {
    return isForbidden(error) ? (
      <NoAccess />
    ) : (
      <ErrorCard title={`Could not load ${config.label.toLowerCase()}`} onRetry={onRetry} />
    );
  }
  if (!rows || rows.length === 0) {
    return totalCount === 0 ? (
      <EmptyState icon={ClipboardList} title="No records yet" description={`${config.label} you register will show up here.`} className="py-10" />
    ) : (
      <EmptyState icon={SearchX} title="No match" description="Try another month or team leader." className="py-10" />
    );
  }

  return (
    <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm max-md:block">
          <caption className="sr-only">{config.label}</caption>
          <thead className="text-xs text-muted-foreground max-md:sr-only">
            <tr className="border-b border-border/50">
              {config.columns.map((column) => (
                <th key={column.header} scope="col" className="px-4 py-2 font-medium">{column.header}</th>
              ))}
              <th scope="col" className="px-4 py-2 font-medium">State</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 max-md:block">
            {rows.map((record) => {
              const state = config.state(record);
              const title = config.title(record);
              return (
                <tr key={record.id} className="max-md:block max-md:space-y-1 max-md:px-4 max-md:py-3">
                  {config.columns.map((column) => (
                    <td
                      key={column.header}
                      data-label={column.header}
                      className="px-4 py-2.5 max-md:flex max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-0.5 max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]"
                    >
                      {column.cell(record)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 max-md:px-0 max-md:py-0.5">
                    <StateBadge {...state} />
                  </td>
                  <td className="px-4 py-1 text-right max-md:px-0">
                    <RowActions
                      title={title}
                      actions={config.actions(record, viewer)}
                      onPick={(action) => onAction(action, record)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};
