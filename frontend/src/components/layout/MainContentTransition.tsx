import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DURATION, EASE, useMotionTransition } from "@/lib/motion";

interface MainContentTransitionProps {
  pathname: string;
  className?: string;
  children: React.ReactNode;
}

export const MainContentTransition: React.FC<MainContentTransitionProps> = ({
  pathname,
  className,
  children,
}) => {
  const transition = useMotionTransition({ duration: DURATION.base, ease: EASE.out });
  return (
    <div className="flex-1 overflow-auto">
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
