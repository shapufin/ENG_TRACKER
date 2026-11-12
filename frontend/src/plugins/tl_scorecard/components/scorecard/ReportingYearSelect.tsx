import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportingYearOptions } from "./reportingYearOptions";

interface ReportingYearSelectProps {
  year: number;
  onYearChange: (year: number) => void;
}

/** Picks which year the EPR and partnership figures cover, so a closed year stays reachable. */
export const ReportingYearSelect: React.FC<ReportingYearSelectProps> = ({ year, onYearChange }) => (
  <div className="flex items-center justify-end gap-2">
    <Label htmlFor="scorecard-reporting-year" className="text-xs">
      Reporting year
    </Label>
    <Select value={String(year)} onValueChange={(value) => onYearChange(Number(value))}>
      <SelectTrigger id="scorecard-reporting-year" className="w-28" controlSize="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {reportingYearOptions(year).map((option) => (
          <SelectItem key={option} value={String(option)}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
