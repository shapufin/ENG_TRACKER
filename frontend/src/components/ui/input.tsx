import * as React from "react";

import { cn } from "@/lib/utils";
import { controlSurface, type ControlSize } from "./controlSurface";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Height token. Named `controlSize` because `size` is the native input attribute. */
  controlSize?: ControlSize;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, controlSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
          controlSurface({ controlSize }),
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
