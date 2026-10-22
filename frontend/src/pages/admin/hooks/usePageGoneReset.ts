import { useEffect } from "react";

/**
 * A page past the end (its last rows were just actioned, or another admin removed them)
 * is a 404 from the server: fall back to page 1.
 */
export const usePageGoneReset = (error: unknown, page: number, setPage: (page: number) => void) => {
  const pageGone = (error as { response?: { status?: number } } | null)?.response?.status === 404;
  useEffect(() => {
    // The 404 comes from the server (external state); there is no event to hang the reset on.
    if (pageGone && page > 1) setPage(1);
  }, [pageGone, page, setPage]);
};
