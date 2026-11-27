import { useEffect, useState } from "react";

/**
 * Content width of an element, kept current by a ResizeObserver; `null` until
 * the first measure, so callers can render their unmeasured default.
 *
 * Returns `[width, ref]`: pass `ref` as (or call it from) the element's ref
 * callback, so an element that mounts late (a table replacing a card list) is
 * picked up. Updates are coalesced to one per animation frame.
 */
export function useContainerWidth(): [number | null, (element: HTMLElement | null) => void] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    let latest: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next === undefined) return;
      latest = Math.round(next);
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setWidth(latest);
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element]);

  return [width, setElement];
}
