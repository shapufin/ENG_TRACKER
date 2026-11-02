import { useEffect, useState } from "react";

const BELOW_XL_QUERY = "(max-width: 1279px)";

/**
 * True below the 1280px `xl` breakpoint. The calendar keeps its member sidebar
 * beside the grid only from here up: with the app sidebar taking 264px, a
 * docked calendar sidebar leaves the month grid too narrow (or pushes it below
 * the fold) on tablets and small laptops.
 */
export function useIsBelowXl(): boolean {
  const [below, setBelow] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(BELOW_XL_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(BELOW_XL_QUERY);
    const onChange = (event: MediaQueryListEvent) => setBelow(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return below;
}
