import * as React from "react";

interface FacetRowProps {
  label: string;
  children: React.ReactNode;
}

/** One labelled row of filter chips: a quiet 12px label, chips wrapping beside it. */
export const FacetRow: React.FC<FacetRowProps> = ({ label, children }) => {
  const labelId = React.useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
      <span
        id={labelId}
        title={label}
        className="text-muted-foreground w-full shrink-0 text-xs font-medium sm:w-auto sm:min-w-20"
      >
        {label}
      </span>
      {children}
    </div>
  );
};
