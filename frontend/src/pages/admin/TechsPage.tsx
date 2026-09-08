import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Power, Trash2, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TechMembersDialog } from "@/components/admin/TechMembersDialog";
import { userService } from "@/services/userService";
import type { Tech } from "@/types";
import { toast } from "sonner";

export const TechsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", code: "" });
  const [editing, setEditing] = useState<Tech | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tech | null>(null);
  const [membersTarget, setMembersTarget] = useState<Tech | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "techs"],
    queryFn: () => userService.getTechs(),
  });
  const create = useMutation({
    mutationFn: () =>
      userService.createTech({ name: form.name.trim(), code: form.code.trim().toUpperCase() }),
    onSuccess: () => {
      setForm({ name: "", code: "" });
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
      setEditing(null);
      setForm({ name: "", code: "" });
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
    <PageShell title="Tech">
      <GlassCard isHoverLift={false} className="p-4">
        <h2 className="mb-3 font-semibold">{editing ? `Edit ${editing.name}` : "Add Tech"}</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="tech-name">Name</Label>
            <Input
              id="tech-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tech-code">Code</Label>
            <Input
              id="tech-code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
          </div>
          <Button
            onClick={() => (editing ? update.mutate() : create.mutate())}
            disabled={
              !form.name.trim() || !form.code.trim() || create.isPending || update.isPending
            }
          >
            {editing ? (
              "Save"
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Add
              </>
            )}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm({ name: "", code: "" });
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </GlassCard>
      <div className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Techs...
          </div>
        )}
        {!isLoading && (data?.results ?? []).length === 0 && (
          <GlassCard isHoverLift={false}>
            <EmptyState
              icon={Wrench}
              title="No Techs yet"
              description="Add one above to get started."
            />
          </GlassCard>
        )}
        {(data?.results ?? []).map((tech) => (
          <div
            key={tech.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <div>
                <div className="font-medium">
                  {tech.name}
                  {!tech.is_active && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{tech.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={tech.is_active ? `Deactivate ${tech.name}` : `Activate ${tech.name}`}
                title={tech.is_active ? "Deactivate" : "Activate"}
                onClick={() => toggleActive.mutate(tech)}
                disabled={toggleActive.isPending}
              >
                <Power
                  className={`h-4 w-4 ${tech.is_active ? "text-success" : "text-muted-foreground"}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Manage users in ${tech.name}`}
                title="Manage users"
                onClick={() => setMembersTarget(tech)}
              >
                <Users className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${tech.name}`}
                onClick={() => {
                  setEditing(tech);
                  setForm({ name: tech.name, code: tech.code });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${tech.name}`}
                onClick={() => setDeleteTarget(tech)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
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
