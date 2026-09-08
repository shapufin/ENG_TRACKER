import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format, parseISO } from "date-fns";

interface QueueHighlight {
  id: number;
  type: string;
  userName: string;
  date: string;
  details: string;
  status: string;
}

interface QueueHighlightsSectionProps {
  highlights: QueueHighlight[];
  isLoading: boolean;
  isError: boolean;
}

export const QueueHighlightsSection: React.FC<QueueHighlightsSectionProps> = ({
  highlights,
  isLoading,
  isError,
}) => {
  return (
    <GlassCard className="border border-border/60 bg-background/50">
      <div className="flex items-center justify-between p-5">
        <h3 className="text-lg font-semibold">Queue highlights</h3>
        <span className="text-sm text-muted-foreground">Most recent</span>
      </div>
      <div className="grid gap-4 p-5 pt-0 md:grid-cols-2">
        {isLoading && (
          <>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-6 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </>
        )}
        {isError && (
          <p className="col-span-full text-sm text-destructive">Failed to load highlights.</p>
        )}
        {highlights.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4 transition hover:border-primary/30"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-primary/10 text-primary">
                  {item.userName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{item.userName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.type.charAt(0).toUpperCase() + item.type.slice(1)} •{" "}
                  {format(parseISO(item.date), "dd MMM")}
                </p>
                <p className="text-sm text-muted-foreground/60">{item.details}</p>
              </div>
            </div>
            <StatusBadge variant={item.status as StatusVariant} />
          </div>
        ))}
        {!isLoading && !isError && highlights.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending approvals detected.</p>
        )}
      </div>
    </GlassCard>
  );
};
