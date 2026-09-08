import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TeamsTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TeamsTableToolbar: React.FC<TeamsTableToolbarProps> = ({
  searchQuery,
  onSearchChange,
}) => (
  <div className="flex flex-col gap-4 border-b border-border/50 p-5 lg:flex-row lg:items-center lg:justify-between">
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search teams..."
        className="h-12 rounded-2xl border-border bg-muted/30 pl-11"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
    <Button variant="outline" className="h-12 rounded-2xl border-border bg-muted/30">
      Columns (6/6)
    </Button>
  </div>
);
