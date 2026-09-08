import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterSelectProps<T extends { id: number | string }> {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  allLabel: string;
  noneLabel?: string;
  options?: T[];
  renderOption: (item: T) => string;
}

export const FilterSelect = <T extends { id: number | string }>({
  label,
  icon,
  value,
  onChange,
  placeholder,
  allLabel,
  noneLabel,
  options,
  renderOption,
}: FilterSelectProps<T>) => (
  <div className="space-y-2">
    <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      {icon} {label}
    </Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 bg-background/50 px-3">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {noneLabel && <SelectItem value="none">{noneLabel}</SelectItem>}
        {options?.map((item) => (
          <SelectItem key={item.id} value={String(item.id)}>
            {renderOption(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
