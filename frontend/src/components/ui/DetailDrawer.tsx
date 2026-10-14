import * as React from "react";
import { cn } from "@/lib/utils";

interface DetailDrawerHeroProps {
  name: string;
  subtitle?: React.ReactNode;
  avatarText?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const DetailDrawerHero: React.FC<DetailDrawerHeroProps> = ({
  name,
  subtitle,
  avatarText,
  badges,
  actions,
  className,
}) => {
  const initials = avatarText || (name ? name.slice(0, 2).toUpperCase() : "");

  return (
    <div className={cn("flex items-start gap-3.5", className)}>
      <div
        className="border-primary/25 bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border font-mono text-base font-semibold shadow-xs"
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-foreground truncate text-base font-semibold tracking-tight">
            {name}
          </h2>
          {badges}
        </div>
        {subtitle && <div className="text-muted-foreground truncate text-xs">{subtitle}</div>}
        {actions}
      </div>
    </div>
  );
};

interface DetailDrawerSectionProps {
  id?: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const DetailDrawerSection: React.FC<DetailDrawerSectionProps> = ({
  id,
  title,
  icon: Icon,
  badge,
  children,
  className,
}) => {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "border-border/60 bg-surface-sunken/40 space-y-3 rounded-2xl border p-4 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <div
              className="border-primary/20 bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border"
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
          <h3 id={id} className="text-foreground/90 text-xs font-semibold tracking-wider uppercase">
            {title}
          </h3>
        </div>
        {badge}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
};

interface DetailDrawerRowProps {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const DetailDrawerRow: React.FC<DetailDrawerRowProps> = ({
  label,
  children,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        "border-border/40 grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b py-2 last:border-b-0",
        className
      )}
    >
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="text-foreground min-w-0 text-sm font-medium">{children}</div>
      <div className="flex items-center justify-end">
        {action ?? <span className="w-7" aria-hidden="true" />}
      </div>
    </div>
  );
};

interface DetailDrawerMetricCardProps {
  label: string;
  value: React.ReactNode;
  helper?: string;
  className?: string;
}

export const DetailDrawerMetricCard: React.FC<DetailDrawerMetricCardProps> = ({
  label,
  value,
  helper,
  className,
}) => {
  return (
    <div
      className={cn(
        "border-border/60 bg-background/60 flex flex-col gap-0.5 rounded-xl border p-2.5",
        className
      )}
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {label}
      </span>
      <span className="text-foreground font-mono text-base font-semibold tabular-nums">
        {value}
      </span>
      {helper && <span className="text-muted-foreground text-xs">{helper}</span>}
    </div>
  );
};

export const DetailDrawerMetricGrid: React.FC<{
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}> = ({ children, cols = 4, className }) => {
  const colClass =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4";
  return <div className={cn("grid gap-2", colClass, className)}>{children}</div>;
};

export const DetailDrawerEmpty: React.FC = () => (
  <span className="text-muted-foreground text-sm italic">Not set</span>
);
