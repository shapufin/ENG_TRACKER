import React from "react";
import { Badge } from "@/components/ui/badge";

interface StatusRowProps {
  label: string;
  value: number;
  color: string;
}

export const StatusRow: React.FC<StatusRowProps> = ({ label, value, color }) => {
  return (
    <div className="flex items-center justify-between rounded-xl border px-4 py-3">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </div>
      <Badge variant="secondary">{value}</Badge>
    </div>
  );
};
