/** Audience and publish settings for a custom organigrama chart. */
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/context/PermissionContext";
import { OrganigramaPublishAudienceCard } from "../components/OrganigramaPublishAudienceCard";
import { OrganigramaPublishStatusCard } from "../components/OrganigramaPublishStatusCard";
import {
  useOrganigramaChart,
  useOrganigramaDraft,
  useAudienceRoles,
  useAudienceGroups,
  useUpdateChart,
  usePublishChart,
  useUnpublishChart,
  useValidateDraft,
  useOrganigramaRevisions,
} from "../hooks/useOrganigramaAdmin";
import type { AudienceMode, OrgChartRevision } from "../types";

const AUDIENCE_GROUP_PAGE_SIZE = 100;

const audienceLabels: Record<AudienceMode, string> = {
  all_authenticated: "All authenticated users",
  selected: "Selected roles or groups",
  private_admin: "Administrators only",
};

const formatTimestamp = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export const OrganigramaPublishPage: React.FC = () => {
  const navigate = useNavigate();
  const { chartId } = useParams<{ chartId: string }>();
  const { isAdmin, isSuperuser } = usePermissions();
  const id = Number(chartId);

  const {
    data: chart,
    isLoading: chartLoading,
    isError: chartError,
  } = useOrganigramaChart(Number.isNaN(id) ? null : id);

  const { data: draft, isLoading: draftLoading } = useOrganigramaDraft(
    Number.isNaN(id) ? null : id
  );

  const { data: roles = [], isLoading: rolesLoading } = useAudienceRoles();
  const [groupSearch, setGroupSearch] = useState("");
  const debouncedGroupSearch = useDebouncedValue(groupSearch, 300);
  const [groupPage, setGroupPage] = useState(1);
  const { data: groupsResponse, isLoading: groupsLoading } = useAudienceGroups(
    debouncedGroupSearch.trim() || undefined,
    groupPage
  );
  const groups = useMemo(() => groupsResponse?.results ?? [], [groupsResponse?.results]);
  const totalGroupPages = Math.max(
    1,
    Math.ceil((groupsResponse?.count ?? 0) / AUDIENCE_GROUP_PAGE_SIZE)
  );

  const [audienceMode, setAudienceMode] = useState<AudienceMode>(
    chart?.audience_mode ?? "private_admin"
  );
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(chart?.audience_role_codes ?? [])
  );
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(
    new Set(chart?.audience_group_ids ?? [])
  );
  const [dirty, setDirty] = useState(false);

  // Resync local state when the chart refetches (e.g. after publish/unpublish
  // or an audience save by another admin) and the form is not dirty.
  // Without this, the local state stays stale after mutations and the user
  // would edit from old values.
  useEffect(() => {
    if (dirty || !chart) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudienceMode(chart.audience_mode ?? "private_admin");
    setSelectedRoles(new Set(chart.audience_role_codes ?? []));
    setSelectedGroups(new Set(chart.audience_group_ids ?? []));
  }, [chart, dirty]);

  const { data: revisionsData } = useOrganigramaRevisions(Number.isNaN(id) ? null : id);
  const revisions = useMemo(() => revisionsData?.results ?? [], [revisionsData?.results]);

  const validateDraft = useValidateDraft(id);
  const updateChart = useUpdateChart(id);
  const publishChart = usePublishChart(id);
  const unpublishChart = useUnpublishChart(id);

  const displayAudienceMode = dirty ? audienceMode : (chart?.audience_mode ?? "private_admin");
  const displayRoleCodes = useMemo(
    () => (dirty ? Array.from(selectedRoles) : (chart?.audience_role_codes ?? [])),
    [dirty, selectedRoles, chart?.audience_role_codes]
  );
  const displayGroupIds = useMemo(
    () => (dirty ? Array.from(selectedGroups) : (chart?.audience_group_ids ?? [])),
    [dirty, selectedGroups, chart?.audience_group_ids]
  );
  const isPublic = displayAudienceMode === "all_authenticated";

  const audienceIsValid = useMemo(() => {
    if (displayAudienceMode !== "selected") return true;
    return displayRoleCodes.length > 0 || displayGroupIds.length > 0;
  }, [displayAudienceMode, displayRoleCodes, displayGroupIds]);

  const formatMutationError = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "An unexpected error occurred.";
  };

  const handleSaveAudience = () => {
    if (displayAudienceMode === "selected" && !audienceIsValid) return;
    updateChart.mutate(
      {
        audience_mode: displayAudienceMode,
        audience_role_codes: displayRoleCodes,
        audience_group_ids: displayGroupIds,
      },
      {
        onSuccess: () => setDirty(false),
      }
    );
  };

  const handleValidate = () => {
    if (!draft) return;
    validateDraft.mutate({
      revision_number: draft.revision_number,
      nodes: draft.nodes,
      edges: draft.edges,
    });
  };

  const [changeSummary, setChangeSummary] = useState("");

  // Staff-only API (IsStaffOrSuperuser) — HR admitted by the admin route
  // guard would only see 403s here. Placed after ALL hooks (rules-of-hooks).
  if (!isAdmin && !isSuperuser) {
    return <Navigate to="/organigrama" replace />;
  }

  const handlePublish = () => {
    publishChart.mutate({ change_summary: changeSummary.trim() || undefined });
  };

  const handleUnpublish = () => {
    unpublishChart.mutate();
  };

  const toggleRole = (code: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setDirty(true);
  };

  const toggleGroup = (groupId: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setDirty(true);
  };

  const handleAudienceModeChange = (value: AudienceMode) => {
    setAudienceMode(value);
    setDirty(true);
  };

  if (chartLoading) {
    return (
      <PageShell title="Publish & Audience">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (chartError || !chart) {
    return (
      <PageShell title="Publish & Audience">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p>Failed to load chart.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Publish & Audience"
      actions={
        <Button variant="outline" onClick={() => navigate(`/admin/organigrama/${id}/builder`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to builder
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Target chart:</span>
        <span
          className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-foreground"
          title={chart.name}
        >
          {chart.name}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <OrganigramaPublishAudienceCard
          audienceMode={displayAudienceMode}
          roles={roles}
          rolesLoading={rolesLoading}
          selectedRoles={displayRoleCodes}
          groups={groups}
          groupsLoading={groupsLoading}
          groupSearch={groupSearch}
          groupPage={groupPage}
          totalGroupPages={totalGroupPages}
          selectedGroups={displayGroupIds}
          dirty={dirty}
          audienceIsValid={audienceIsValid}
          isSaving={updateChart.isPending}
          error={updateChart.error ? formatMutationError(updateChart.error) : null}
          onAudienceModeChange={handleAudienceModeChange}
          onToggleRole={toggleRole}
          onToggleGroup={toggleGroup}
          onGroupSearchChange={(value) => {
            setGroupSearch(value);
            setGroupPage(1);
          }}
          onGroupPageChange={setGroupPage}
          onSave={handleSaveAudience}
        />

        <OrganigramaPublishStatusCard
          chart={chart}
          draft={draft}
          draftLoading={draftLoading}
          validation={validateDraft.data}
          validatePending={validateDraft.isPending}
          publish={{ isPending: publishChart.isPending, error: publishChart.error }}
          unpublish={{ isPending: unpublishChart.isPending, error: unpublishChart.error }}
          changeSummary={changeSummary}
          onChangeSummary={setChangeSummary}
          onValidate={handleValidate}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          formatError={formatMutationError}
          formatTimestamp={formatTimestamp}
          audienceIsValid={audienceIsValid}
          isPublic={isPublic}
          audienceMode={displayAudienceMode}
          roleCodes={displayRoleCodes}
          groupCount={displayGroupIds.length}
          audienceLabels={audienceLabels}
        />
      </div>

      {revisions.length > 0 && (
        <GlassCard className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <h2 className="text-lg font-semibold">Revision history</h2>
          </div>
          <div className="space-y-2">
            {revisions.map((rev: OrgChartRevision) => (
              <div
                key={rev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      v{rev.version}
                    </Badge>
                    {rev.change_summary && (
                      <span className="truncate text-muted-foreground" title={rev.change_summary}>
                        {rev.change_summary}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rev.published_by_name ?? "Unknown"} · {formatTimestamp(rev.published_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </PageShell>
  );
};
