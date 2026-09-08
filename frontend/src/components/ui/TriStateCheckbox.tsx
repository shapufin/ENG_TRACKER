/**
 * TriStateCheckbox — checkbox with an explicit "indeterminate" state.
 *
 * States cycle on click: indeterminate → checked → unchecked → indeterminate.
 * Used by bulk editors where "indeterminate" means "leave unchanged" so that
 * editing one field (e.g. teams) does not force every other field (e.g. roles)
 * to be re-specified for all selected rows.
 *
 * Built directly on Radix Checkbox (which natively supports
 * checked="indeterminate") rather than wrapping the project's `Checkbox`
 * primitive, so the existing primitive stays a simple boolean control.
 */
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type TriStateValue = boolean | "indeterminate";

interface TriStateCheckboxProps {
  id?: string;
  checked: TriStateValue;
  onCheckedChange: (value: TriStateValue) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const next = (v: TriStateValue): TriStateValue =>
  v === "indeterminate" ? true : v === true ? false : "indeterminate";

export const TriStateCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  TriStateCheckboxProps
>(({ id, checked, onCheckedChange, disabled, className, ...rest }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    id={id}
    checked={checked}
    disabled={disabled}
    onCheckedChange={() => onCheckedChange(next(checked))}
    className={cn(
      "h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary/10 data-[state=indeterminate]:text-primary",
      className
    )}
    {...rest}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {checked === "indeterminate" ? (
        <Minus className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-4 w-4" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
TriStateCheckbox.displayName = "TriStateCheckbox";
