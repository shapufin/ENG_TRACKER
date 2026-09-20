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
  /** Display name when `value` is set but absent from `options` (e.g. an
   * inactive former TL). Rendered as a disabled fallback item so the cell
   * never shows a misleading blank. */
  currentName?: string | null;
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
  currentName,
  disabled,
  onChange,
}) => {
  const isKnown = value == null || options.some((tl) => tl.id === value);
  const fallbackLabel = currentName?.trim() || (value != null ? `Former TL (#${value})` : null);
  return (
    <Select
      value={isKnown ? (value ? String(value) : "none") : String(value)}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className="h-9 w-full">
        <SelectValue placeholder="No TL" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No TL</SelectItem>
        {!isKnown && fallbackLabel && (
          <SelectItem value={String(value)} disabled>
            {fallbackLabel} (inactive)
          </SelectItem>
        )}
        {options.map((tl) => (
          <SelectItem key={tl.id} value={String(tl.id)}>
            {tl.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
