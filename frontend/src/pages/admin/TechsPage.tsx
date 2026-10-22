import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { RowActions } from "@/components/ui/RowActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TechFormDialog } from "@/components/admin/TechFormDialog";
import { TechMembersDialog } from "@/components/admin/TechMembersDialog";
import { TechLevelEditor } from "@/components/admin/TechLevelEditor";
import { TechStatsCards } from "./components/TechStatsCards";
import { userService } from "@/services/userService";
import type { Tech } from "@/types";
import { toast } from "sonner";

export const TechsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", code: "" });
  const [editing, setEditing] = useState<Tech | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tech | null>(null);
  const [membersTarget, setMembersTarget] = useState<Tech | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    // "all": this page needs inactive techs too (the level editor and the
    // status toggle act on them). useUserManagement caches active-only techs
    // under ["admin", "techs", "active"] — sharing one key made the two
    // fetches overwrite each other's cache.
    queryKey: ["admin", "techs", "all"],
    queryFn: () => userService.getTechs(),
  });
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm({ name: "", code: "" });
  };
  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "" });
    setFormOpen(true);
  };
  const create = useMutation({
    mutationFn: () =>
      userService.createTech({ name: form.name.trim(), code: form.code.trim().toUpperCase() }),
    onSuccess: () => {
      closeForm();
      queryClient.invalidateQueries({ queryKey: ["admin", "techs"] });
      toast.success("Tech created");
    },
    onError: () => toast.error("Failed to create Tech. Check for duplicate name/code."),
  });
  const update = useMutation({
    mutationFn: () =>
      userService.updateTech(editing!.id, {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
      }),
    onSuccess: () => {
      closeForm();
      queryClient.invalidateQueries({ queryKey: ["admin", "techs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      toast.success("Tech updated");
    },
    onError: () => toast.error("Failed to update Tech. Check for duplicate name/code."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => userService.deleteTech(id),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "techs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      toast.success("Tech deleted");
    },
    onError: () => toast.error("Failed to delete Tech."),
  });
  const toggleActive = useMutation({
    mutationFn: (tech: Tech) => userService.updateTech(tech.id, { is_active: !tech.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "techs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      toast.success("Tech status updated");
    },
    onError: () => toast.error("Failed to toggle Tech status."),
  });

  return (
    <PageShell
      title="Tech"
      actions={
        <>
          <PluginImportButton targetKey="techs" invalidateKeys={[["admin", "techs"]]} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Tech
          </Button>
        </>
      }
    >
      <TechStatsCards techs={data?.results ?? []} />
      {isLoading && <LoadingCard title="Loading Techs..." rows={4} className="min-h-[200px]" />}
      {!isLoading && (data?.results ?? []).length === 0 && (
        <GlassCard>
          <EmptyState icon={Wrench} title="No Techs yet" description="Add a Tech to get started." />
        </GlassCard>
      )}
      {(data?.results ?? []).length > 0 && (
        <GlassCard className="divide-border/70 divide-y overflow-hidden p-0">
          {(data?.results ?? []).map((tech) => (
            <div key={tech.id} className="group/row px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="control-icon-sm"
                    aria-expanded={expandedId === tech.id}
                    aria-label={`${expandedId === tech.id ? "Hide" : "Show"} levels for ${tech.name}`}
                    onClick={() => setExpandedId(expandedId === tech.id ? null : tech.id)}
                  >
                    {expandedId === tech.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <div>
                    <div className="font-medium">
                      {tech.name}
                      {!tech.is_active && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {tech.description && (
                      <p className="text-muted-foreground max-w-xl truncate text-xs">
                        {tech.description}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {tech.code}
                      {(tech.levels?.length ?? 0) > 0 && (
                        <span className="ml-2">
                          {tech.levels!.length} level{tech.levels!.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    aria-label={`${tech.members_count ?? 0} engineer${tech.members_count === 1 ? "" : "s"}`}
                    className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums"
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {tech.members_count ?? 0}
                  </span>
                  <RowActions
                    actions={[
                      {
                        label: tech.is_active ? `Deactivate ${tech.name}` : `Activate ${tech.name}`,
                        icon: Power,
                        tone: tech.is_active ? "success" : "default",
                        disabled: toggleActive.isPending,
                        onClick: () => toggleActive.mutate(tech),
                      },
                      {
                        label: `Manage users in ${tech.name}`,
                        icon: Users,
                        onClick: () => setMembersTarget(tech),
                      },
                      {
                        label: `Edit ${tech.name}`,
                        icon: Pencil,
                        onClick: () => {
                          setEditing(tech);
                          setForm({ name: tech.name, code: tech.code });
                          setFormOpen(true);
                        },
                      },
                      {
                        label: `Delete ${tech.name}`,
                        icon: Trash2,
                        tone: "danger",
                        onClick: () => setDeleteTarget(tech),
                      },
                    ]}
                  />
                </div>
              </div>
              {expandedId === tech.id && <TechLevelEditor tech={tech} />}
            </div>
          ))}
        </GlassCard>
      )}
      <TechFormDialog
        open={formOpen}
        onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (editing) update.mutate();
          else create.mutate();
        }}
        isSubmitting={create.isPending || update.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Tech"
        description={`Delete ${deleteTarget?.name ?? "this Tech"}? Existing user assignments will be removed.`}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
      <TechMembersDialog
        tech={membersTarget}
        open={!!membersTarget}
        onOpenChange={(open) => !open && setMembersTarget(null)}
      />
    </PageShell>
  );
};
