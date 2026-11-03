import React from "react";
import { Label } from "@/components/ui/label";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/SearchableCombobox";

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
}: FilterSelectProps<T>) => {
  const items: ComboboxOption[] = [
    { value: "all", label: allLabel },
    ...(noneLabel ? [{ value: "none", label: noneLabel }] : []),
    ...(options ?? []).map((item) => ({ value: String(item.id), label: renderOption(item) })),
  ];
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
        {icon} {label}
      </Label>
      <SearchableCombobox
        ariaLabel={label}
        options={items}
        value={value}
        onChange={(next) => onChange(next ?? "all")}
        placeholder={placeholder}
        searchPlaceholder={`Search ${label.toLowerCase()}...`}
      />
    </div>
  );
};
