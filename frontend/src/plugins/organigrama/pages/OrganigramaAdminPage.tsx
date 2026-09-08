/** Admin directory for custom organigrama charts. */
import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Search,
  Star,
  Trash2,
  Network,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormDialog } from "@/components/ui/FormDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/context/PermissionContext";
import {
  useCreateChart,
  useDeleteChart,
  useOrganigramaCharts,
  useUpdateChart,
} from "../hooks/useOrganigramaAdmin";
import type { OrgChart } from "../types";

const canHardDelete = (chart: OrgChart) => chart.status === "draft" || chart.status === "archived";

const formatUpdated = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const audienceSummary = (chart: OrgChart) => {
  if (chart.audience_mode === "all_authenticated") return "All authenticated";
  if (chart.audience_mode === "private_admin") return "Admins only";
  const roles = chart.audience_role_codes?.length ?? 0;
  const groups = chart.audience_group_ids?.length ?? 0;
  if (roles === 0 && groups === 0) return "Selected (empty)";
  return `Selected · ${roles} role${roles === 1 ? "" : "s"} · ${groups} group${groups === 1 ? "" : "s"}`;
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/** Per-row component so useUpdateChart can be called at the top level. */
const ChartRow: React.FC<{
  chart: OrgChart;
  onDelete: (chart: OrgChart) => void;
}> = ({ chart, onDelete }) => {
  const navigate = useNavigate();
  const updateChart = useUpdateChart(chart.id);

  const toggleFeatured = () => {
    updateChart.mutate({ is_featured: !chart.is_featured });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium" title={chart.name}>
            {chart.name}
          </p>
          <Badge
            variant={chart.status === "published" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {chart.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {chart.node_count} nodes · rev {chart.revision_number} · {audienceSummary(chart)}
        </p>
        {chart.updated_at && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Updated {formatUpdated(chart.updated_at)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                aria-label={chart.is_featured ? "Unfeature chart" : "Feature chart"}
                onClick={toggleFeatured}
                disabled={updateChart.isPending}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    chart.is_featured ? "fill-warning text-warning" : "text-muted-foreground"
                  }`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{chart.is_featured ? "Unfeature" : "Feature"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/admin/organigrama/${chart.id}/builder`)}
        >
          <Pencil className="mr-2 h-3 w-3" /> Open
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/admin/organigrama/${chart.id}/publish`)}
        >
          <Rocket className="mr-2 h-3 w-3" /> Publish
        </Button>
        {canHardDelete(chart) ? (
          <Button
            size="sm"
            variant="outline"
            aria-label="Delete chart"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => onDelete(chart)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Delete chart"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  disabled
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Published charts cannot be deleted. Unpublish first.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

export const OrganigramaAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isSuperuser } = usePermissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const params: Record<string, string> = {};
  if (search.trim()) params.search = search.trim();
  if (statusFilter !== "all") params.status = statusFilter;

  const { data: charts, isLoading, isError } = useOrganigramaCharts(params);
  const { mutate: createChart, isPending: creating } = useCreateChart();
  const { mutate: deleteChart, isPending: deleting } = useDeleteChart();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OrgChart | null>(null);

  // The charts directory/builder API is staff-only (IsStaffOrSuperuser) —
  // HR admitted by the admin route guard would only see 403s here. The
  // user-shell /organigrama page is the HR-visible surface.
  if (!isAdmin && !isSuperuser) {
    return <Navigate to="/organigrama" replace />;
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createChart(
      { name: name.trim(), description: description.trim() },
      {
        onSuccess: (chart) => {
          setCreateOpen(false);
          setName("");
          setDescription("");
          navigate(`/admin/organigrama/${chart.id}/builder`);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteChart(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  if (isLoading) {
    return (
      <PageShell title="Organigrama Admin">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="Organigrama Admin">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p>Failed to load charts.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Organigrama Admin"
      subtitle="Create, edit, and manage custom organizational charts."
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Chart
        </Button>
      }
    >
      <GlassCard isHoverLift={false} className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, slug, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      <GlassCard isHoverLift={false} className="p-4">
        <div className="space-y-2">
          {charts && charts.length > 0 ? (
            charts.map((chart) => (
              <ChartRow key={chart.id} chart={chart} onDelete={setDeleteTarget} />
            ))
          ) : (
            <EmptyState
              icon={Network}
              title={
                search || statusFilter !== "all"
                  ? "No charts match the current filters."
                  : "No charts yet"
              }
              description={
                search || statusFilter !== "all"
                  ? "Try a different search or status filter."
                  : "Create a chart to get started."
              }
              action={
                !search && statusFilter === "all" ? (
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Chart
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </GlassCard>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create new chart"
        onSubmit={handleCreate}
        isSubmitting={creating}
        submitLabel="Create"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="chart-name">Name</Label>
            <Input
              id="chart-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering"
            />
          </div>
          <div>
            <Label htmlFor="chart-description">Description</Label>
            <Input
              id="chart-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete chart"
        description={`Delete “${deleteTarget?.name}”? This cannot be undone.`}
        onConfirm={handleDelete}
        isConfirming={deleting}
        confirmLabel="Delete"
        variant="destructive"
      />
    </PageShell>
  );
};
