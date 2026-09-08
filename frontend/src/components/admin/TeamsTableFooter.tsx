import React from "react";

interface TeamsTableFooterProps {
  count: number;
}

export const TeamsTableFooter: React.FC<TeamsTableFooterProps> = ({ count }) => (
  <div className="border-t border-border/50 px-6 py-4 text-sm text-muted-foreground">
    {count} result{count !== 1 ? "s" : ""}
  </div>
);
