import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useResourceGroups } from "./useResourceGroups";

const DEFAULT_PAGE_SIZE = 25;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function useResourceAccessDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const page = clamp(Number(searchParams.get("page") ?? "1"), 1, 10_000);
  const pageSize = clamp(
    Number(searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE)),
    1,
    100
  );

  const { groups, createGroup, updateGroup, bulkDeleteGroups } = useResourceGroups({
    search,
    page,
    pageSize,
  });

  const setSearch = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          if (value) prev.set("search", value);
          else prev.delete("search");
          prev.delete("page");
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (value: number) => {
      setSearchParams(
        (prev) => {
          prev.set("page", String(value));
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearSearch = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("search");
        prev.delete("page");
        return prev;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const totalCount = groups.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const directoryState = useMemo(() => {
    if (groups.isLoading && !groups.data) return "loading" as const;
    if (groups.isError) return "error" as const;
    if (totalCount === 0 && search.length === 0) return "empty-system" as const;
    if (totalCount === 0 && search.length > 0) return "empty-search" as const;
    // Page beyond the last real page (e.g. via URL ?page=999 or after
    // deletions shrank the page count). The backend returns an empty page,
    // so without this state the table renders blank with no way forward.
    if (totalCount > 0 && page > totalPages) return "out-of-range" as const;
    return "ready" as const;
  }, [groups.isLoading, groups.data, groups.isError, totalCount, search, page, totalPages]);

  return {
    search,
    page,
    pageSize,
    totalPages,
    groups,
    createGroup,
    updateGroup,
    bulkDeleteGroups,
    setSearch,
    setPage,
    clearSearch,
    directoryState,
    totalCount,
  };
}
