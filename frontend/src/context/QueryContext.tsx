import React from "react";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { isMaintenanceError } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (_error, query) => {
      // Allow individual queries to opt out of the global toast via
      // `meta: { silentError: true }` in their useQuery options.
      if (query.meta?.silentError) return;
      // A closed platform is not a data error: the maintenance screen already
      // explains it, and one toast per failed query would bury the page.
      if (isMaintenanceError(_error)) return;
      toast.error("Failed to load data");
    },
  }),
});

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
