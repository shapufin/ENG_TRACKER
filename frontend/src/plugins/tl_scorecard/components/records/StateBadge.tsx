import React from "react";
import type { LucideIcon } from "lucide-react";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

interface StateBadgeProps {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

/** Icon + visible text on a tone surface, so state never depends on colour alone. */
export const StateBadge: React.FC<StateBadgeProps> = ({ label, tone, icon: Icon }) => (
  <span
    role="status"
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
      toneSurfaceClass[tone]
    )}
  >
    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {label}
  </span>
);
