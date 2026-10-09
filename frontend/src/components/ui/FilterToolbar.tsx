import * as React from "react";
import { cn } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** Pure layout for a filter row. Colours/heights belong to the controls inside (controlSurface.ts). */
function FilterToolbar({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}

function FilterToolbarSearch({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("relative w-full max-w-sm min-w-[12rem] flex-1 sm:w-auto", className)}
      {...props}
    />
  );
}

function FilterToolbarGroup({ className, ...props }: DivProps) {
  return <div className={cn("ml-auto flex items-center gap-2", className)} {...props} />;
}

FilterToolbar.Search = FilterToolbarSearch;
FilterToolbar.Group = FilterToolbarGroup;

export { FilterToolbar };
