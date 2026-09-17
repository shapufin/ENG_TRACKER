import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";

export const DEFAULT_SITE_NAME = "Engineering Tracker";
export const SITE_BRANDING_QUERY_KEY = ["site-branding"];

/** Shared site-branding query, used by both sidebars. Also keeps the
 * browser tab title in sync so it isn't static once an admin renames the
 * site — the only other place `site_name` shows.
 */
export const useSiteBranding = () => {
  const query = useQuery({
    queryKey: SITE_BRANDING_QUERY_KEY,
    queryFn: () => dashboardService.getBranding(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    document.title = query.data?.site_name || DEFAULT_SITE_NAME;
  }, [query.data?.site_name]);

  return query;
};
