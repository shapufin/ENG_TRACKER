/** TanStack Query hooks for the Organigrama plugin. */
import { useQuery } from "@tanstack/react-query";
import { organigramaService } from "../services/organigramaService";

const TREE_KEY = ["organigrama", "tree"] as const;
const VISIBLE_KEY = ["organigrama", "visible"] as const;
const PUBLISHED_KEY = ["organigrama", "published"] as const;

export const useOrganigramaTree = () => {
  return useQuery({
    queryKey: TREE_KEY,
    queryFn: () => organigramaService.getTree(),
    staleTime: 60_000,
  });
};

export const useOrganigramaSubtree = (
  nodeId: number | null,
  nodeType: "person" | "tech" | null,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ["organigrama", "subtree", nodeType, nodeId],
    queryFn: () => organigramaService.getSubtree(nodeId!, nodeType!),
    enabled: nodeId !== null && nodeType !== null && enabled,
    staleTime: 60_000,
  });
};

export const useOrganigramaVisibleCharts = () => {
  return useQuery({
    queryKey: VISIBLE_KEY,
    queryFn: () => organigramaService.getVisibleCharts(),
    staleTime: 60_000,
  });
};

export const useOrganigramaPublished = (chartId: number | null) => {
  return useQuery({
    queryKey: [...PUBLISHED_KEY, chartId],
    queryFn: () => organigramaService.getPublishedChart(chartId!),
    enabled: chartId !== null,
    staleTime: 60_000,
  });
};
