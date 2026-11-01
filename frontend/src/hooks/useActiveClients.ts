import { useQuery } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";

/**
 * Cache key for the picker list. Deliberately a *child* of `["overtime","clients"]`
 * so the admin Clients page (which needs archived rows too) keeps its own entry:
 * both pages used to share one key, and filtering one would have silently
 * filtered the other. Prefix invalidation still reaches this key.
 */
const ACTIVE_CLIENTS_QUERY_KEY = ["overtime", "clients", "active"] as const;

interface UseActiveClientsOptions {
  staleTime?: number;
}

/**
 * Active clients for every form picker (overtime, standby, ticket KPI).
 *
 * Archived clients are excluded here; an edit dialog that opened a record of an
 * archived client injects that one client back (see `OvertimeFormDialog` and
 * `StandbyFormDialog`) so the record still saves.
 */
export const useActiveClients = (options?: UseActiveClientsOptions) =>
  useQuery({
    queryKey: ACTIVE_CLIENTS_QUERY_KEY,
    queryFn: () => overtimeService.getActiveClients(),
    staleTime: options?.staleTime,
  });
