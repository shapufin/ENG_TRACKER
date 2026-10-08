import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeSlideUp, DURATION, EASE } from "@/lib/motion";

interface GlassCardProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  /** Hover lift + border change. Only for cards that are actually clickable. */
  interactive?: boolean;
  /** `flat` = no shadow, hairline border (rare nested surfaces). */
  variant?: "default" | "flat";
  glow?: "primary" | "success" | "warning" | "destructive" | "none";
  delay?: number;
  /** Skip this card's own mount fade/slide — use when a parent already
   * orchestrates entrance (e.g. a `staggerContainer`/`staggerItem` gallery),
   * so the two animations don't stack into a double-fade. */
  animateOnMount?: boolean;
}

const GlassCardComponent = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      className,
      interactive = false,
      variant = "default",
      glow = "none",
      delay = 0,
      animateOnMount = true,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const glowMap = {
      primary: "before:bg-primary/10",
      success: "before:bg-success/10",
      warning: "before:bg-warning/10",
      destructive: "before:bg-destructive/10",
      none: "before:bg-transparent",
    };

    return (
      <motion.div
        ref={ref}
        initial={!animateOnMount || shouldReduceMotion ? false : "hidden"}
        animate={animateOnMount ? "visible" : undefined}
        variants={animateOnMount ? fadeSlideUp : undefined}
        transition={
          !animateOnMount || shouldReduceMotion
            ? { duration: 0 }
            : { duration: DURATION.base, delay, ease: EASE.inOut }
        }
        className={cn(
          "relative overflow-hidden rounded-xl border bg-card",
          variant === "flat" ? "border-line-subtle" : "border-border shadow-card",
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']",
          glowMap[glow],
          interactive &&
            "transition-all duration-300 hover:-translate-y-1 hover:border-border-focus hover:shadow-pop",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

export const GlassCard = React.memo(GlassCardComponent);
GlassCard.displayName = "GlassCard";
