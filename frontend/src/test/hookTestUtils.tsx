/**
 * Shared test utilities for React Query hook tests.
 *
 * Extracted to eliminate `createWrapper` duplication across 5 test files
 * (flagged by fallow dupes analysis).
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Creates a wrapper component that provides a QueryClient to the hook
 * under test via renderHook.
 *
 * Usage:
 *   const queryClient = new QueryClient();
 *   const { result } = renderHook(() => useMyHook(), {
 *     wrapper: createWrapper(queryClient),
 *   });
 */
export const createWrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
