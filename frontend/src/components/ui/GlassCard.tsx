import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  isHoverLift?: boolean;
  glow?: "primary" | "success" | "warning" | "destructive" | "none";
  delay?: number;
}

const GlassCardComponent = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className, isHoverLift = true, glow = "none", delay = 0, ...props }, ref) => {
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
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration: 0.25, delay, ease: "easeInOut" }
        }
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-glass backdrop-blur-xl",
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']",
          glowMap[glow],
          isHoverLift &&
            "transition-all duration-300 hover:-translate-y-1 hover:border-border-focus hover:shadow-glass-lg",
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
