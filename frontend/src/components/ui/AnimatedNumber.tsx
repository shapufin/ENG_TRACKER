import React, { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useTransform, useReducedMotion, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 1.2,
  className,
  suffix = "",
  prefix = "",
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
    duration: duration * 1000,
  });
  // Reduced motion: read straight from the un-sprung value so the number
  // updates instantly instead of spring-animating (WCAG 2.3.3).
  const display = useTransform(reduceMotion ? motionValue : springValue, (latest) =>
    Math.round(latest).toLocaleString()
  );

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
};
