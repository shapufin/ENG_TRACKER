import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MainContentTransitionProps {
  pathname: string;
  className?: string;
  children: React.ReactNode;
}

export const MainContentTransition: React.FC<MainContentTransitionProps> = ({
  pathname,
  className,
  children,
}) => (
  <div className="flex-1 overflow-auto">
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  </div>
);
