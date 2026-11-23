import React, { useId } from "react";
import { Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IdleFlag } from "../../types/tlScorecard";
import { DETAIL_ITEMS, type DetailItem } from "./recordDetails";
import { StateBadge } from "./StateBadge";
import { canManage, type KindConfig, type RecordRow, type Viewer } from "./recordKinds";

interface RecordDetailDialogProps {
  open: boolean;
  config: KindConfig<RecordRow>;
  record: RecordRow;
  viewer: Viewer;
  onOpenChange: (open: boolean) => void;
  /** Starts the weekly status-update flow; rendered only for open idle flags the viewer manages. */
  onLogUpdate?: (record: RecordRow) => void;
}

const VisibilityChip: React.FC<{ item: DetailItem }> = ({ item }) => {
  if (item.visibility === "private") {
    return (
      <span className="bg-tone-warning-surface text-tone-warning-text inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Private — {item.sharedWith ?? "only you and staff"}
      </span>
    );
  }
  if (item.visibility === "shared") {
    return (
      <span className="bg-tone-info-surface text-tone-info-text inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
        <Users className="h-3 w-3" aria-hidden="true" />
        Shared with {item.sharedWith}
      </span>
    );
  }
  return null;
};

/**
 * A block carries prose, a custom node or a privacy label; anything else is a
 * one-line fact. Splitting the two stops a five-word value and a wall of notes
 * from carrying the same visual weight.
 */
const isBlock = (item: DetailItem): boolean =>
  Boolean(item.node || item.visibility || item.emptyText);

const DetailFact: React.FC<{ item: DetailItem }> = ({ item }) => (
  <div className="border-line-subtle rounded-lg border px-3.5 py-2.5">
    <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
      {item.label}
    </h3>
    <p className="mt-1 text-sm font-medium break-words">{item.text}</p>
  </div>
);

const DetailBlock: React.FC<{ item: DetailItem; headingId: string }> = ({ item, headingId }) => (
  <section
    aria-labelledby={headingId}
    className="border-line-subtle overflow-hidden rounded-lg border"
  >
    <div className="border-line-subtle bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3.5 py-2">
      <h3 id={headingId} className="text-foreground text-xs font-semibold tracking-wider uppercase">
        {item.label}
      </h3>
      <VisibilityChip item={item} />
    </div>
    <div className="px-3.5 py-3">
      {item.node ??
        (item.text ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{item.text}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {item.emptyText ?? "None recorded."}
          </p>
        ))}
    </div>
  </section>
);

/**
 * Full read view of one record: every serialized field, full notes (no
 * truncation) and the privacy label on each free-text block, plus the data the
 * table never shows — meeting attendees and the idle flag's weekly status log.
 */
export const RecordDetailDialog: React.FC<RecordDetailDialogProps> = ({
  open,
  config,
  record,
  viewer,
  onOpenChange,
  onLogUpdate,
}) => {
  const items = DETAIL_ITEMS[config.key](record, viewer);
  const facts = items.filter((item) => !isBlock(item));
  const blocks = items.filter(isBlock);
  const idPrefix = useId();
  const state = config.state(record);
  const canLogUpdate =
    config.key === "idle" &&
    (record as IdleFlag).status === "open" &&
    canManage(viewer, (record as IdleFlag).flagged_by) &&
    Boolean(onLogUpdate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{config.typeChip(record)}</Badge>
            <StateBadge {...state} />
          </div>
          <DialogTitle>{config.title(record)}</DialogTitle>
          <DialogDescription>
            {config.label} · {config.date(record)} · {config.person(record)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {facts.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {facts.map((item) => (
                <DetailFact key={item.label} item={item} />
              ))}
            </div>
          )}
          {blocks.length > 0 && (
            <div className="space-y-3">
              {blocks.map((item, index) => (
                <DetailBlock key={item.label} item={item} headingId={`${idPrefix}-${index}`} />
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {canLogUpdate && (
            <Button type="button" onClick={() => onLogUpdate?.(record)}>
              Log weekly update
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
