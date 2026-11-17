import React from "react";
import { User2 } from "lucide-react";

export const ListViewEmptyState: React.FC = () => (
  <div className="flex h-[300px] items-center justify-center">
    <div className="text-center">
      <User2 className="text-muted-foreground/60 mx-auto h-10 w-10" />
      <h3 className="text-foreground mt-4 text-sm font-medium">No events found</h3>
      <p className="text-muted-foreground mt-1 text-xs">Try adjusting your search query</p>
    </div>
  </div>
);
