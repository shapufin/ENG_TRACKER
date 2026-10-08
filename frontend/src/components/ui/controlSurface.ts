import { cva, type VariantProps } from "class-variance-authority";

/**
 * Single definition of a form control's surface (height, radius, fill, edge,
 * text, placeholder, focus ring). Input, Textarea, SelectTrigger, SearchField
 * and the toolbar Button sizes all consume it; pages compose, never restyle.
 * Height/edge come from the `--control-*` tokens in index.css (density and
 * touch-target size are decided there). Decision D1: soft edge, the focus ring
 * carries the 3:1. Keep a real `border` (forced-colors safe); no ring-offset.
 *
 * Prop name: `controlSize` (not `size`) because `size` is a native <input>
 * attribute. Button keeps its existing `size` prop and gains `control-*` sizes.
 */
export const controlSurface = cva(
  "w-full rounded-[var(--control-radius)] border border-control-edge bg-field-bg px-3 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-control-edge-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive touch-manipulation motion-reduce:transition-none",
  {
    variants: {
      controlSize: {
        sm: "",
        md: "",
        lg: "",
      },
      kind: {
        field: "",
        area: "min-h-24 py-2 leading-6 resize-y",
      },
    },
    compoundVariants: [
      { kind: "field", controlSize: "sm", class: "h-[var(--control-h-sm)]" },
      { kind: "field", controlSize: "md", class: "h-[var(--control-h)]" },
      { kind: "field", controlSize: "lg", class: "h-[var(--control-h-lg)]" },
    ],
    defaultVariants: { controlSize: "md", kind: "field" },
  }
);

export type ControlSize = NonNullable<VariantProps<typeof controlSurface>["controlSize"]>;
