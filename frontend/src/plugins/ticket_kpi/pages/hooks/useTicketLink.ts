import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/error-handler";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ticketKPIService } from "../../services/ticketKPIService";

export const useTicketLink = (overtimeLogId: number | undefined) => {
  const queryClient = useQueryClient();
  const { canManage } = usePluginPermissions();
  const canLink = canManage("ticket_kpi");
  const [query, setQuery] = useState("");
  // Debounce the search input so rapid keystrokes batch into a single
  // API refetch instead of one request per character.
  const debouncedQuery = useDebouncedValue(query, 300);

  const linksQuery = useQuery({
    queryKey: ["ticket_kpi", "overtime-links", overtimeLogId],
    queryFn: () => ticketKPIService.getOvertimeLinks(overtimeLogId as number),
    enabled: canLink && !!overtimeLogId,
  });

  const searchQuery = useQuery({
    queryKey: ["ticket_kpi", "ticket-search", debouncedQuery],
    queryFn: () => ticketKPIService.searchTickets(debouncedQuery),
    enabled: canLink && debouncedQuery.trim().length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: (normalizedTicketId: number) =>
      ticketKPIService.createLink(overtimeLogId as number, normalizedTicketId),
    onSuccess: () => {
      setQuery("");
      queryClient.invalidateQueries({
        queryKey: ["ticket_kpi", "overtime-links", overtimeLogId],
      });
    },
    onError: handleApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: number) => ticketKPIService.deleteLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ticket_kpi", "overtime-links", overtimeLogId],
      });
    },
    onError: handleApiError,
  });

  return {
    canLink,
    query,
    setQuery,
    links: linksQuery.data?.results ?? [],
    searchResults: searchQuery.data?.results ?? [],
    isLoading: linksQuery.isLoading,
    isSearching: searchQuery.isFetching,
    createLink: createMutation.mutate,
    deleteLink: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
