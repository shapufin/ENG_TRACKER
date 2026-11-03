import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DURATION, EASE, useMotionTransition } from "@/lib/motion";

interface MainContentTransitionProps {
  pathname: string;
  className?: string;
  /**
   * Let the page own its height and scroll instead of scrolling this wrapper.
   * The calendar uses it: a month grid has to fill the viewport, so an
   * `overflow-auto` ancestor with no definite height forces it to overflow.
   */
  fill?: boolean;
  children: React.ReactNode;
}

export const MainContentTransition: React.FC<MainContentTransitionProps> = ({
  pathname,
  className,
  fill = false,
  children,
}) => {
  const transition = useMotionTransition({ duration: DURATION.base, ease: EASE.out });
  return (
    <div className={cn("flex-1", fill ? "flex min-h-0 flex-col overflow-hidden" : "overflow-auto")}>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={transition}
          className={className}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
