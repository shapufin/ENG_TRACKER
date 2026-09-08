import React from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface HRSearchControlsProps {
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
}

export const HRSearchControls: React.FC<HRSearchControlsProps> = ({
  searchQuery,
  onSearchQueryChange,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex flex-1 items-center gap-4">
      <div className="relative max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search personnel..."
          className="bg-background/50 pl-9"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
        />
      </div>
    </div>
  </div>
);
