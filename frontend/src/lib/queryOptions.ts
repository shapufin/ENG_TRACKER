/**
 * Standard query options for report queries.
 * Provides consistent caching and refetching behavior.
 */
export const REPORT_QUERY_OPTIONS = {
  refetchOnMount: true,
  staleTime: 300000,
  refetchOnWindowFocus: false,
} as const;
