import React from "react";
import { AlertTriangle } from "lucide-react";

interface ConflictItemProps {
  date: string;
  description: string;
}

export const ConflictItem: React.FC<ConflictItemProps> = ({ date, description }) => (
  <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
    <div className="rounded-full bg-red-500/10 p-2">
      <AlertTriangle className="h-4 w-4 text-red-400" />
    </div>
    <div>
      <p className="font-medium text-foreground dark:text-white">{date}</p>
      <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">{description}</p>
    </div>
  </div>
);
