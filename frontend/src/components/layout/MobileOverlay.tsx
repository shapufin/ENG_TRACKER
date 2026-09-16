import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DURATION, useMotionTransition } from "@/lib/motion";

interface MobileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileOverlay: React.FC<MobileOverlayProps> = ({ isOpen, onClose }) => {
  const transition = useMotionTransition({ duration: DURATION.base });
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
    </AnimatePresence>
  );
};
