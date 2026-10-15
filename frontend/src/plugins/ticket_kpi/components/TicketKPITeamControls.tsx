import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, ShieldAlert } from "lucide-react";
import { formatMonthLabel, generateMonthOptions } from "@/lib/monthOptions";

interface TicketKPITeamControlsProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

export const TicketKPITeamControls: React.FC<TicketKPITeamControlsProps> = ({
  selectedMonth,
  onMonthChange,
}) => {
  const monthOptions = generateMonthOptions(12, true);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.filter(Boolean).map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Badge variant="outline" className="text-xs">
        <ShieldAlert className="mr-1 h-3 w-3" />
        TL actions are logged
      </Badge>
    </div>
  );
};
