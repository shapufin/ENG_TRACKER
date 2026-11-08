import * as React from "react";
import { cn } from "@/lib/utils";

const FADE = "1.5rem"; // ds-allow-hardcode: edge fade width

const maskFor = (start: boolean, end: boolean): string | undefined => {
  if (!start && !end) return undefined;
  const from = start ? `transparent, black ${FADE}` : "black, black";
  const to = end ? `black calc(100% - ${FADE}), transparent` : "black, black";
  return `linear-gradient(to right, ${from}, ${to})`;
};

/**
 * Horizontal scroller with no scrollbar that fades an edge only while content
 * is hidden past it, so a clipped tab strip reads as scrollable.
 */
export const ScrollFadeX = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onScroll, style, ...props }, forwardedRef) => {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const [fade, setFade] = React.useState({ start: false, end: false });

    const measure = React.useCallback(() => {
      const el = ref.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = { start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 };
      setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    }, []);

    React.useLayoutEffect(() => {
      measure();
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }, [measure]);

    const mask = maskFor(fade.start, fade.end);

    return (
      <div
        {...props}
        ref={(node) => {
          ref.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        data-fade-start={String(fade.start)}
        data-fade-end={String(fade.end)}
        onScroll={(event) => {
          measure();
          onScroll?.(event);
        }}
        className={cn("no-scrollbar overflow-x-auto", className)}
        style={{ ...style, maskImage: mask, WebkitMaskImage: mask }}
      />
    );
  }
);
ScrollFadeX.displayName = "ScrollFadeX";
