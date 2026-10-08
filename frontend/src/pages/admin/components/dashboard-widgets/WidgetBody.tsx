import React from "react";
import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

interface WidgetBodyProps {
  title: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Non-null replaces the body: the widget has loaded but there is nothing to show. */
  empty: { icon: LucideIcon; title: string; description?: string } | null;
  children: React.ReactNode;
}

/**
 * Loading / error / empty states for the content of a tab inside a merged widget.
 * Same states as `WidgetFrame`, minus the card: the parent card (and its tabs) stay
 * usable when only one tab's request fails.
 */
export const WidgetBody: React.FC<WidgetBodyProps> = ({
  title,
  isLoading,
  isError,
  onRetry,
  empty,
  children,
}) => {
  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm font-medium">{`Couldn't load ${title.toLowerCase()}`}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={`Loading ${title}`}
        className="bg-muted/40 h-full min-h-[180px] w-full animate-pulse rounded-lg"
      />
    );
  }
  if (empty) return <EmptyState {...empty} className="p-6" />;
  return <>{children}</>;
};
