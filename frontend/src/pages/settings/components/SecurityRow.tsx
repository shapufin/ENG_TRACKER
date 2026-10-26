import React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";

interface SecurityRowProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  /** Status chip next to the title (e.g. an On/Off badge). */
  status?: React.ReactNode;
  hint?: React.ReactNode;
  /** Colours the row by state: warning asks for attention, success confirms protection. */
  tone?: Tone;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** One line of the Profile card's Security block: icon, title + status, hint, actions. */
export const SecurityRow: React.FC<SecurityRowProps> = ({
  icon,
  title,
  status,
  hint,
  tone = "neutral",
  actions,
  children,
}) => (
  <div className={cn("rounded-xl border px-3 py-2.5", toneSurfaceClass[tone])}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden="true" className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {status}
        </div>
        {hint && <p className="text-xs opacity-90">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </div>
);
