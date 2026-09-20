import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TeamLeaderOption {
  id: number;
  full_name: string;
}

interface TeamLeaderSelectProps {
  ariaLabel: string;
  value: number | null;
  options: TeamLeaderOption[];
  disabled?: boolean;
  onChange: (teamLeaderUserId: number | null) => void;
}

/** Inline TL picker — commits immediately on change, no separate save
 * step. Used by the HR TL-assignment page and the TL-revoke-blocked
 * reassignment dialog. */
export const TeamLeaderSelect: React.FC<TeamLeaderSelectProps> = ({
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
}) => (
  <Select
    value={value ? String(value) : "none"}
    onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    disabled={disabled}
  >
    <SelectTrigger aria-label={ariaLabel} className="h-9 w-full">
      <SelectValue placeholder="No TL" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="none">No TL</SelectItem>
      {options.map((tl) => (
        <SelectItem key={tl.id} value={String(tl.id)}>
          {tl.full_name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
