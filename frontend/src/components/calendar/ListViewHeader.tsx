import React from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListViewHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export const ListViewHeader: React.FC<ListViewHeaderProps> = ({ query, onQueryChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 md:px-5">
    <div>
      <h2 className="text-lg font-semibold text-foreground">Schedule List</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        All vacation, sick, standby and holiday entries
      </p>
    </div>

    <div className="relative w-full sm:w-[260px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search events..."
        aria-label="Search calendar events"
        className={cn(
          "h-10 rounded-xl border-border/60 bg-background/50 pl-10 text-sm text-foreground",
          "placeholder:text-muted-foreground"
        )}
      />
    </div>
  </div>
);
