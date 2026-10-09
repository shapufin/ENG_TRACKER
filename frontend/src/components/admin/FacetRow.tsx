import * as React from "react";

interface FacetRowProps {
  label: string;
  children: React.ReactNode;
}

/** One labelled row of filter chips: a quiet 12px label, chips wrapping beside it. */
export const FacetRow: React.FC<FacetRowProps> = ({ label, children }) => (
  <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
    <span
      title={label}
      className="text-muted-foreground w-full shrink-0 text-xs font-medium sm:w-20"
    >
      {label}
    </span>
    {children}
  </div>
);
