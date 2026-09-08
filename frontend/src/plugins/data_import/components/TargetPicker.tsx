import React from "react";
import { Users, CalendarDays } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportTarget } from "../types/dataImport";

const targetIcons: Record<string, React.ReactNode> = {
  users: <Users className="h-6 w-6" />,
  leave_balances: <CalendarDays className="h-6 w-6" />,
};

interface TargetPickerProps {
  targets: ImportTarget[];
  selectedTargetKey: string | null;
  onSelect: (targetKey: string) => void;
}

export const TargetPicker: React.FC<TargetPickerProps> = ({
  targets,
  selectedTargetKey,
  onSelect,
}) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {targets.map((target) => {
        const isSelected = selectedTargetKey === target.target_key;
        return (
          <GlassCard
            key={target.target_key}
            isHoverLift={false}
            className={`cursor-pointer ${isSelected ? "ring-1 ring-primary/20" : ""}`}
            onClick={() => onSelect(target.target_key)}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="text-primary">
                {targetIcons[target.target_key] ?? <span className="h-6 w-6" />}
              </div>
              <CardTitle className="text-lg">{target.display_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{target.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {target.fields.length} fields available
              </p>
            </CardContent>
          </GlassCard>
        );
      })}
    </div>
  );
};
