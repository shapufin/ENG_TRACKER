import { useQuery } from "@tanstack/react-query";
import { maintenanceService } from "@/services/maintenanceService";

export const MAINTENANCE_STATUS_QUERY_KEY = ["maintenance-status"] as const;

/** Window event dispatched by the API layer when any call answers 503
 * `code=maintenance`, so the gate reacts on the same tick instead of waiting
 * for the next poll. */
export const MAINTENANCE_ACTIVE_EVENT = "maintenance:active";

/**
 * Site-wide maintenance state.
 *
 * Deliberate exception to the app-wide `refetchOnWindowFocus: false` rule
 * (CONTEXT rule 14): a kill switch flipped in another tab or by an admin must
 * be seen when the user comes back, exactly like the plugin metadata queries.
 * Polls fast while the site is down, slowly otherwise, so an idle session does
 * not hammer the endpoint.
 */
export const useMaintenanceStatus = () => {
  return useQuery({
    queryKey: MAINTENANCE_STATUS_QUERY_KEY,
    queryFn: () => maintenanceService.getStatus(),
    staleTime: 0,
    retry: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.active ? 30_000 : 300_000),
    meta: { silentError: true },
  });
};
