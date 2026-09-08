/** TanStack Query hooks for the Organigrama admin builder. */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { organigramaAdminService } from "../services/organigramaAdminService";
import type { OrgChartNode, OrgChartEdge, UpdateChartPayload } from "../types";

const ADMIN_KEY = ["organigrama-admin"] as const;
// Public-facing query keys (used by useOrganigramaQueries). Admin mutations
// that change what users can see (publish/unpublish/audience) must invalidate
// these so the viewer page reflects changes without waiting for staleTime.
const PUBLIC_VISIBLE_KEY = ["organigrama", "visible"] as const;
const PUBLIC_PUBLISHED_KEY = ["organigrama", "published"] as const;

export const useOrganigramaCharts = (params?: Record<string, unknown>) => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "charts", params],
    queryFn: () => organigramaAdminService.getCharts(params),
  });
};

export const useOrganigramaChart = (id: number | null) => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "chart", id],
    queryFn: () => organigramaAdminService.getChart(id!),
    enabled: id !== null,
  });
};

export const useOrganigramaDraft = (id: number | null) => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "draft", id],
    queryFn: () => organigramaAdminService.getDraft(id!),
    enabled: id !== null,
    refetchOnWindowFocus: false,
  });
};

export const useAudienceRoles = () => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "audience-roles"],
    queryFn: () => organigramaAdminService.getAudienceRoles(),
  });
};

export const useAudienceGroups = (search?: string, page = 1) => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "audience-groups", search, page],
    queryFn: () => organigramaAdminService.getAudienceGroups({ search, page, page_size: 100 }),
  });
};

export const useOrganigramaRevisions = (id: number | null) => {
  return useQuery({
    queryKey: [...ADMIN_KEY, "revisions", id],
    queryFn: () => organigramaAdminService.getRevisions(id!),
    enabled: id !== null,
  });
};

export const useCreateChart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof organigramaAdminService.createChart>[0]) =>
      organigramaAdminService.createChart(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
};

export const useUpdateChart = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateChartPayload) => organigramaAdminService.updateChart(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "chart", id] });
      // Audience changes affect which users can see the chart in the public
      // viewer, so invalidate the visible-charts list.
      qc.invalidateQueries({ queryKey: PUBLIC_VISIBLE_KEY });
    },
  });
};

export const useDeleteChart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: organigramaAdminService.deleteChart,
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
};

export const useSaveDraft = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      revision_number: number;
      nodes: OrgChartNode[];
      edges: OrgChartEdge[];
    }) => organigramaAdminService.saveDraft(id, payload),
    onSuccess: (data) => {
      // Synchronously update the draft cache with the save response so the
      // builder's revision_number is immediately current — without this, a
      // rapid second save would use the stale revision_number and get a 409.
      // Using setQueryData (instead of invalidateQueries) also avoids a
      // refetch that would overwrite the user's post-save edits in the
      // builder's useEffect.
      qc.setQueryData([...ADMIN_KEY, "draft", id], data);
      // Invalidate the chart query so revision_number/updated_at refresh —
      // the admin directory shows updated_at.
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "chart", id] });
    },
  });
};

export const useValidateDraft = (id: number) => {
  return useMutation({
    mutationFn: (payload: {
      revision_number: number;
      nodes: OrgChartNode[];
      edges: OrgChartEdge[];
    }) => organigramaAdminService.validateDraft(id, payload),
  });
};

export const usePublishChart = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload?: { change_summary?: string }) =>
      organigramaAdminService.publishChart(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "chart", id] });
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "revisions", id] });
      // Publishing makes the chart visible to users — invalidate public keys.
      qc.invalidateQueries({ queryKey: PUBLIC_VISIBLE_KEY });
      qc.invalidateQueries({ queryKey: [...PUBLIC_PUBLISHED_KEY, id] });
    },
  });
};

export const useUnpublishChart = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => organigramaAdminService.unpublishChart(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "chart", id] });
      qc.invalidateQueries({ queryKey: [...ADMIN_KEY, "revisions", id] });
      // Unpublishing hides the chart from users — invalidate public keys.
      qc.invalidateQueries({ queryKey: PUBLIC_VISIBLE_KEY });
      qc.invalidateQueries({ queryKey: [...PUBLIC_PUBLISHED_KEY, id] });
    },
  });
};
