import React from "react";
import type { LucideIcon } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";

interface WidgetFrameProps {
  title: string;
  /** PDF capture id (the widget id). */
  sectionId?: string;
  description?: string;
  className?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Non-null replaces the body: the widget has loaded but there is nothing to show. */
  empty: { icon: LucideIcon; title: string; description?: string } | null;
  children: React.ReactNode;
}

/** Card with the shared loading / error / empty states every dashboard widget needs. */
export const WidgetFrame: React.FC<WidgetFrameProps> = ({
  title,
  sectionId,
  description,
  className,
  isLoading,
  isError,
  onRetry,
  empty,
  children,
}) => {
  if (isError) {
    return (
      <ErrorCard
        title={`Couldn't load ${title.toLowerCase()}`}
        message="The request failed."
        onRetry={onRetry}
        className={className}
      />
    );
  }
  return (
    <ChartCard
      title={title}
      description={description}
      className={className}
      sectionId={isLoading ? undefined : sectionId}
    >
      {isLoading ? (
        <div
          role="status"
          aria-label={`Loading ${title}`}
          className="bg-muted/40 h-full min-h-[180px] w-full animate-pulse rounded-lg"
        />
      ) : empty ? (
        <EmptyState {...empty} className="p-6" />
      ) : (
        children
      )}
    </ChartCard>
  );
};
