import React from "react";
import { User2 } from "lucide-react";

export const ListViewEmptyState: React.FC = () => (
  <div className="flex h-[300px] items-center justify-center">
    <div className="text-center">
      <User2 className="mx-auto h-10 w-10 text-muted-foreground/60" />
      <h3 className="mt-4 text-sm font-medium text-foreground">No events found</h3>
      <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search query</p>
    </div>
  </div>
);
