import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-safe:supports-[backdrop-filter]:backdrop-blur-md",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Width scale. Emitted UNPREFIXED on purpose: `cn` is tailwind-merge, and a
 * variant-prefixed class (`sm:max-w-md`) is a different merge group from an
 * unprefixed one, so a prefixed default would not be overridable by callsites.
 * Never pass `max-w-*` to DialogContent — use `size`.
 */
const dialogSizeVariants = cva("", {
  variants: {
    size: {
      sm: "max-w-md", // 448px — confirmations, quick prompts
      md: "max-w-lg", // 512px — standard forms
      lg: "max-w-2xl", // 672px — audits, metric breakdowns, wide forms
      xl: "max-w-4xl", // 896px — multi-step wizards, tabular forms
      full: "max-w-[min(1100px,95vw)]", // command drawers
    },
  },
  defaultVariants: { size: "md" },
});

export type DialogSize = NonNullable<VariantProps<typeof dialogSizeVariants>["size"]>;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  size?: DialogSize;
  /** Bakes the scroll contract (flex column + overflow-hidden). Default true. */
  scroll?: boolean;
  /**
   * Bakes the surface padding. Default true. Pass `false` for full-bleed
   * shells — a callsite `p-0` cannot cancel the responsive `sm:p-6`, because
   * prefixed and unprefixed classes are different tailwind-merge groups.
   */
  padded?: boolean;
  /** Hide the built-in close button (for dialogs with a custom header close). */
  hideClose?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, size, scroll = true, padded = true, hideClose = false, ...props },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-describedby={undefined}
        className={cn(
          // Positioning + motion
          "no-scrollbar fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          // Sizing. `w-[calc(100%-1rem)]` is unprefixed so it still caps width
          // below the `sm` breakpoint regardless of the chosen size.
          "max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-1rem)] w-[calc(100%-1rem)] sm:max-h-[90vh] sm:w-full",
          // Surface
          "rounded-2xl border bg-popover text-popover-foreground shadow-2xl sm:rounded-3xl",
          padded &&
            "gap-4 px-4 pb-[calc(1rem+var(--safe-area-bottom))] pt-[calc(1.5rem+var(--safe-area-top))] sm:p-6",
          // Scroll contract. Never emit `overflow-y-*` here: it is a different
          // tailwind-merge group from `overflow-hidden` and both would survive.
          scroll ? "flex flex-col overflow-hidden" : "grid overflow-y-auto sm:overflow-visible",
          dialogSizeVariants({ size }),
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:right-4 sm:top-4">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface DialogSlotProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render the divider rule. Off for full-bleed (`p-0`) shells. */
  bordered?: boolean;
}

const DialogHeader = ({ className, bordered = true, ...props }: DialogSlotProps) => (
  <div
    className={cn(
      "flex shrink-0 flex-col space-y-1.5 text-left",
      bordered && "border-b pb-4",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * The scrollable middle region. Keeps header and footer pinned. Use exactly
 * one per dialog — nesting a second scroller creates a double-scrollbar.
 */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4", className)}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({ className, bordered = true, ...props }: DialogSlotProps) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-3 [&>button]:min-h-11",
      bordered && "border-t pt-4",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("flex items-center gap-2 text-base font-extrabold tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
