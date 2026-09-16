import React, { useId, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriStateCheckbox, type TriStateValue } from "@/components/ui/TriStateCheckbox";
import { Crown, ListChecks, Save, Shield, Sparkles, Users } from "lucide-react";
import type { Tech, UserProfile, Team } from "@/types";
import { TechMultiSelect } from "@/components/admin/TechMultiSelect";
import { BulkDrawerHeader } from "@/components/ui/BulkDrawerHeader";
import { TeamMultiSelect } from "@/components/admin/TeamMultiSelect";
import type { BulkUserUpdatePayload } from "@/pages/admin/hooks/useUsersPageBulk";

interface TeamLeader {
  id: number;
  username: string;
  full_name: string;
  team_name: string | null;
  member_count: number;
}

type AssignmentValue = "unchanged" | "remove" | string;

interface UserBulkCommandDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProfiles: UserProfile[];
  teams?: { results: Team[] };
  techs?: { results: Tech[] };
  italianTLs?: TeamLeader[];
  albanianTLs?: TeamLeader[];
  onBulkUpdate: (payload: Omit<BulkUserUpdatePayload, "user_ids">) => void;
  isMutating?: boolean;
}

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, children, className }) => (
  <section
    className={cn(
      "rounded-xl border border-border/60 bg-background/40 p-3.5",
      className
    )}
  >
    <div className="mb-3 flex items-center gap-2">
      <div className="rounded-md bg-primary/10 p-1.5 text-primary">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </section>
);

/** Section whose whole body is gated behind a header-level "apply" switch —
 * one header row instead of a header plus a duplicate checkbox block. */
const ToggleSectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  applyId: string;
  applied: boolean;
  onAppliedChange: (value: boolean) => void;
  children: React.ReactNode;
}> = ({ icon, title, description, hint, applyId, applied, onAppliedChange, children }) => (
  <section
    className={cn(
      "rounded-xl border p-3.5 transition-colors",
      applied ? "border-primary/30 bg-primary/[0.03]" : "border-border/60 bg-background/40"
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "rounded-md p-1.5 transition-colors",
            applied ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </div>
        <div>
          <Label htmlFor={applyId} className="cursor-pointer text-sm font-semibold">
            {title}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={applyId} checked={applied} onCheckedChange={onAppliedChange} />
    </div>
    <div
      className={cn(
        "mt-3 space-y-2 transition-opacity",
        !applied && "pointer-events-none opacity-40"
      )}
    >
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  </section>
);

const AssignmentSelect: React.FC<{
  label: string;
  value: AssignmentValue;
  leaders?: TeamLeader[];
  onChange: (value: AssignmentValue) => void;
}> = ({ label, value, leaders, onChange }) => {
  const triggerId = useId();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={triggerId}>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={triggerId} className="w-full">
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unchanged">Leave unchanged</SelectItem>
          <SelectItem value="remove">Remove assignment</SelectItem>
          {leaders?.map((leader) => (
            <SelectItem key={leader.id} value={String(leader.id)}>
              {leader.full_name || leader.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

const ROLE_STATE_STYLES: Record<"unchanged" | "on" | "off", string> = {
  unchanged: "border-border/60 bg-muted text-muted-foreground",
  on: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  off: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const RoleToggle: React.FC<{
  id: string;
  label: string;
  value: TriStateValue;
  onChange: (value: TriStateValue) => void;
}> = ({ id, label, value, onChange }) => {
  const state = value === "indeterminate" ? "unchanged" : value === true ? "on" : "off";
  const stateLabel = state === "unchanged" ? "Unchanged" : state === "on" ? "Will enable" : "Will disable";
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
        state === "unchanged" ? "border-border/60 bg-background/40" : "border-primary/25 bg-primary/[0.04]"
      )}
    >
      <TriStateCheckbox id={id} checked={value} onCheckedChange={onChange} />
      <span className="flex-1 font-medium">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-micro font-semibold uppercase tracking-wide",
          ROLE_STATE_STYLES[state]
        )}
      >
        {stateLabel}
      </span>
    </label>
  );
};

export const UserBulkCommandDrawer: React.FC<UserBulkCommandDrawerProps> = ({
  open,
  onOpenChange,
  selectedProfiles,
  teams,
  techs,
  italianTLs,
  albanianTLs,
  onBulkUpdate,
  isMutating = false,
}) => {
  const [applyTeams, setApplyTeams] = useState(false);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [applyTechs, setApplyTechs] = useState(false);
  const [techIds, setTechIds] = useState<number[]>([]);
  const [techLevels, setTechLevels] = useState<Record<number, number | null>>({});
  const [italianTl, setItalianTl] = useState<AssignmentValue>("unchanged");
  const [albanianTl, setAlbanianTl] = useState<AssignmentValue>("unchanged");
  const [hrRole, setHrRole] = useState<TriStateValue>("indeterminate");
  const [italianRole, setItalianRole] = useState<TriStateValue>("indeterminate");
  const [albanianRole, setAlbanianRole] = useState<TriStateValue>("indeterminate");

  const selectedCount = selectedProfiles.length;
  const selectedNames = selectedProfiles
    .slice(0, 3)
    .map((profile) => profile.user?.username)
    .join(", ");
  const displayName =
    selectedCount > 3 ? `${selectedNames} +${selectedCount - 3} more` : selectedNames;
  const changeCount = [
    applyTeams,
    applyTechs,
    italianTl !== "unchanged",
    albanianTl !== "unchanged",
    hrRole !== "indeterminate",
    italianRole !== "indeterminate",
    albanianRole !== "indeterminate",
  ].filter(Boolean).length;
  const hasChanges = changeCount > 0;

  const resetForm = () => {
    setApplyTeams(false);
    setTeamIds([]);
    setApplyTechs(false);
    setTechIds([]);
    setTechLevels({});
    setItalianTl("unchanged");
    setAlbanianTl("unchanged");
    setHrRole("indeterminate");
    setItalianRole("indeterminate");
    setAlbanianRole("indeterminate");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleApply = () => {
    if (!hasChanges || isMutating) return;
    const payload: Omit<BulkUserUpdatePayload, "user_ids"> = {};
    if (applyTeams) payload.teams = teamIds;
    // Always the {tech, level} shape: the drawer replaces assignments, so an
    // explicit null must clear a level rather than silently keep the old one.
    if (applyTechs)
      payload.techs = techIds.map((techId) => ({
        tech: techId,
        level: techLevels[techId] ?? null,
      }));
    if (italianTl !== "unchanged")
      payload.italian_tl = italianTl === "remove" ? null : Number(italianTl);
    if (albanianTl !== "unchanged")
      payload.albanian_tl = albanianTl === "remove" ? null : Number(albanianTl);
    if (hrRole !== "indeterminate") payload.is_hr = hrRole === true;
    if (italianRole !== "indeterminate") payload.is_italian_tl_role = italianRole === true;
    if (albanianRole !== "indeterminate") payload.is_albanian_tl_role = albanianRole === true;
    onBulkUpdate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="xl">
        <div className="shrink-0">
          <BulkDrawerHeader
            count={selectedCount}
            title="Bulk edit users"
            subtitle={displayName}
            onClearAndClose={() => {
              resetForm();
              onOpenChange(false);
            }}
          />
        </div>

        <div className="no-scrollbar mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Changes apply to all {selectedCount} selected user{selectedCount === 1 ? "" : "s"}.
              Turn on a section to edit it — everything else is left unchanged.
            </span>
          </div>

          {/* Teams — full width (TeamMultiSelect needs horizontal space) */}
          <ToggleSectionCard
            icon={<Users className="h-4 w-4" />}
            title="Teams"
            description="Replace complete team membership for every selected user."
            hint="Selecting no teams clears all team assignments."
            applyId="bulk-apply-teams"
            applied={applyTeams}
            onAppliedChange={setApplyTeams}
          >
            <TeamMultiSelect
              teams={teams?.results ?? []}
              value={teamIds}
              onChange={setTeamIds}
              placeholder="Select one or more teams..."
              disabled={!applyTeams || isMutating}
            />
          </ToggleSectionCard>

          <ToggleSectionCard
            icon={<ListChecks className="h-4 w-4" />}
            title="Tech"
            description="Replace technology assignments for every selected user."
            hint="Selecting no Tech clears all Tech assignments. A level applies to every selected user."
            applyId="bulk-apply-techs"
            applied={applyTechs}
            onAppliedChange={setApplyTechs}
          >
            <TechMultiSelect
              techs={techs?.results ?? []}
              value={techIds}
              onChange={setTechIds}
              levelByTech={techLevels}
              onLevelChange={(techId, levelId) =>
                setTechLevels((current) => ({ ...current, [techId]: levelId }))
              }
              placeholder="Select one or more Tech..."
              disabled={!applyTechs || isMutating}
            />
          </ToggleSectionCard>

          {/* TL assignments + Roles — side by side to save vertical space */}
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard
              icon={<Crown className="h-4 w-4" />}
              title="Team leader assignments"
              description="Assign or remove each language TL independently."
            >
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                <AssignmentSelect
                  label="Italian TL"
                  value={italianTl}
                  leaders={italianTLs}
                  onChange={setItalianTl}
                />
                <AssignmentSelect
                  label="Albanian TL"
                  value={albanianTl}
                  leaders={albanianTLs}
                  onChange={setAlbanianTl}
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={<Shield className="h-4 w-4" />}
              title="Roles"
              description="Click a role to cycle: unchanged → enable → disable."
            >
              <div className="space-y-2">
                <RoleToggle id="bulk-role-hr" label="HR" value={hrRole} onChange={setHrRole} />
                <RoleToggle
                  id="bulk-role-italian"
                  label="Italian TL role"
                  value={italianRole}
                  onChange={setItalianRole}
                />
                <RoleToggle
                  id="bulk-role-albanian"
                  label="Albanian TL role"
                  value={albanianRole}
                  onChange={setAlbanianRole}
                />
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {hasChanges
              ? `${changeCount} field${changeCount === 1 ? "" : "s"} will change`
              : "No changes staged yet"}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isMutating}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={!hasChanges || selectedCount === 0 || isMutating}>
              {isMutating ? (
                "Applying changes..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Apply changes
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
