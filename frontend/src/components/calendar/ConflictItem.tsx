import React from "react";
import { AlertTriangle } from "lucide-react";

interface ConflictItemProps {
  date: string;
  description: string;
}

export const ConflictItem: React.FC<ConflictItemProps> = ({ date, description }) => (
  <div className="border-tone-danger-border bg-tone-danger-surface flex items-start gap-3 rounded-2xl border p-4">
    <div className="bg-tone-danger-surface rounded-full p-2">
      <AlertTriangle className="text-tone-danger-text h-4 w-4" />
    </div>
    <div>
      <p className="text-foreground font-medium">{date}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  </div>
);
