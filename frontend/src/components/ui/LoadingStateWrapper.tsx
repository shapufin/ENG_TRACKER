import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingCard } from "./LoadingCard";
import { DURATION, useMotionTransition } from "@/lib/motion";

interface LoadingStateWrapperProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingRows?: number;
  minHeight?: string;
}

/**
 * Reusable loading state wrapper with animated transitions.
 * Shows loading card when loading, animates content when ready.
 *
 * Extracted from duplicated code in:
 * - TeamManagementPage (3 instances)
 */
export const LoadingStateWrapper: React.FC<LoadingStateWrapperProps> = ({
  isLoading,
  children,
  loadingRows = 5,
  minHeight = "min-h-[300px]",
}) => {
  const transition = useMotionTransition({ duration: DURATION.base });
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          <LoadingCard rows={loadingRows} className={minHeight} />
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={transition}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
