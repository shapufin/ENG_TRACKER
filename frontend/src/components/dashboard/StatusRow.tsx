import React from "react";
import { Badge } from "@/components/ui/badge";

interface StatusRowProps {
  label: string;
  value: number;
  color: string;
}

export const StatusRow: React.FC<StatusRowProps> = ({ label, value, color }) => {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70">
      <div className="flex items-center gap-2.5">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant="secondary" className="font-mono tabular-nums">
        {value}
      </Badge>
    </div>
  );
};
