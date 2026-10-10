import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconWell } from "@/components/ui/IconWell";
import type { Tone } from "@/components/ui/tone";

interface EmptyStateProps {
  /** Decorative icon shown inside a tinted IconWell. Hidden from assistive tech. */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA slot (e.g. a Button). Rendered only when provided. */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** IconWell tone. */
  tone?: Tone;
  /** md: centred block. sm: left-aligned row for inline/table/chart slots. */
  size?: "sm" | "md";
  /** "What will appear" sample; decorative, hidden from assistive tech. */
  preview?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "neutral",
  size = "md",
  preview,
  className,
}) => {
  const actions =
    action || secondaryAction ? (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          size === "md" ? "justify-center" : "shrink-0"
        )}
      >
        {action}
        {secondaryAction}
      </div>
    ) : null;

  if (size === "sm") {
    return (
      <div className={cn("flex flex-row flex-wrap items-center gap-3 p-4 text-left", className)}>
        <IconWell tone={tone} size="md">
          <Icon className="h-4 w-4" />
        </IconWell>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          {description && (
            <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
        {preview && (
          <div aria-hidden="true" className="pointer-events-none w-full opacity-70">
            {preview}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-3 p-8 text-center", className)}>
      <IconWell tone={tone} size="md">
        <Icon className="h-4 w-4" />
      </IconWell>
      <div className="max-w-md">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
      {preview && (
        <div aria-hidden="true" className="pointer-events-none w-full opacity-70">
          {preview}
        </div>
      )}
    </div>
  );
};
