import React from "react";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/SearchableCombobox";

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

const NO_TL = "none";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** Inline TL picker with type-ahead. Commits immediately on change, no separate
 * save step. Used by the HR TL-assignment page and the TL-revoke-blocked
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

  const items: ComboboxOption[] = [
    { value: NO_TL, label: "No TL" },
    ...(!isKnown && fallbackLabel
      ? [{ value: String(value), label: `${fallbackLabel} (inactive)`, disabled: true }]
      : []),
    ...options.map((tl) => ({
      value: String(tl.id),
      label: tl.full_name,
      initials: initialsOf(tl.full_name),
    })),
  ];

  return (
    <SearchableCombobox
      ariaLabel={ariaLabel}
      options={items}
      value={value == null ? NO_TL : String(value)}
      onChange={(next) => onChange(next === null || next === NO_TL ? null : Number(next))}
      placeholder="No TL"
      searchPlaceholder="Search leaders..."
      disabled={disabled}
    />
  );
};
