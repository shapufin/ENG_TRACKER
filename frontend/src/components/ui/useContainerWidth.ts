import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Content width of `ref`'s element, kept current by a ResizeObserver; `null`
 * until the first measure, so callers can render their unmeasured default.
 *
 * Re-subscribes when the ref points at a different element (an element that
 * mounts late, e.g. a table that replaces a card list).
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  const observed = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === observed.current) return;
    observer.current?.disconnect();
    observed.current = element;
    if (!element || typeof ResizeObserver === "undefined") {
      observer.current = null;
      return;
    }
    observer.current = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) setWidth(Math.round(next));
    });
    observer.current.observe(element);
  });

  useEffect(() => () => observer.current?.disconnect(), []);

  return width;
}
