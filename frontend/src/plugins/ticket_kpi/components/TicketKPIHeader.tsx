import React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Upload, ArrowLeft } from "lucide-react";
import { generateMonthOptions, formatMonthLabel } from "@/lib/monthOptions";

interface TicketKPIHeaderProps {
  isFilteredView: boolean;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onUpload: () => void;
  onBack: () => void;
  memberName?: string;
}

export const TicketKPIHeader: React.FC<TicketKPIHeaderProps> = ({
  isFilteredView,
  selectedMonth,
  onMonthChange,
  onUpload,
  onBack,
  memberName,
}) => {
  const monthOptions = generateMonthOptions();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {isFilteredView && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Team
          </Button>
        )}
        {isFilteredView && memberName && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{memberName}</span>
          </div>
        )}
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{formatMonthLabel(selectedMonth)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" size="sm" onClick={onUpload}>
        <Upload className="mr-2 h-4 w-4" /> Upload
      </Button>
    </div>
  );
};
