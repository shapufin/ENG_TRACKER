import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriStateCheckbox, type TriStateValue } from "@/components/ui/TriStateCheckbox";
import { Crown, Save, Shield, Users } from "lucide-react";
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
  <section className={className}>
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

const AssignmentSelect: React.FC<{
  label: string;
  value: AssignmentValue;
  leaders?: TeamLeader[];
  onChange: (value: AssignmentValue) => void;
}> = ({ label, value, leaders, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
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

const RoleToggle: React.FC<{
  id: string;
  label: string;
  value: TriStateValue;
  onChange: (value: TriStateValue) => void;
}> = ({ id, label, value, onChange }) => {
  const stateLabel = value === "indeterminate" ? "unchanged" : value === true ? "on" : "off";
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-sm"
    >
      <TriStateCheckbox id={id} checked={value} onCheckedChange={onChange} />
      <span className="flex-1 font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{stateLabel}</span>
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
  const hasChanges =
    applyTeams ||
    applyTechs ||
    italianTl !== "unchanged" ||
    albanianTl !== "unchanged" ||
    hrRole !== "indeterminate" ||
    italianRole !== "indeterminate" ||
    albanianRole !== "indeterminate";

  const resetForm = () => {
    setApplyTeams(false);
    setTeamIds([]);
    setApplyTechs(false);
    setTechIds([]);
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
    if (applyTechs) payload.techs = techIds;
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
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <BulkDrawerHeader
          count={selectedCount}
          title="Bulk edit users"
          subtitle={displayName}
          onClearAndClose={() => {
            resetForm();
            onOpenChange(false);
          }}
        />

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Changes apply to all {selectedCount} selected user{selectedCount === 1 ? "" : "s"}.
            Leave a field unchanged unless you intentionally want to update it.
          </div>

          {/* Teams — full width (TeamMultiSelect needs horizontal space) */}
          <SectionCard
            icon={<Users className="h-4 w-4" />}
            title="Teams"
            description="Replace complete team membership for every selected user."
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                <Checkbox
                  id="bulk-apply-teams"
                  checked={applyTeams}
                  onCheckedChange={(value) => setApplyTeams(Boolean(value))}
                />
                <div>
                  <Label htmlFor="bulk-apply-teams" className="cursor-pointer text-sm">
                    Apply team changes
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selecting no teams clears all team assignments.
                  </p>
                </div>
              </div>
              <TeamMultiSelect
                teams={teams?.results ?? []}
                value={teamIds}
                onChange={setTeamIds}
                placeholder="Select one or more teams..."
                disabled={!applyTeams || isMutating}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={<Users className="h-4 w-4" />}
            title="Tech"
            description="Replace technology assignments for every selected user."
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
                <Checkbox
                  id="bulk-apply-techs"
                  checked={applyTechs}
                  onCheckedChange={(value) => setApplyTechs(Boolean(value))}
                />
                <div>
                  <Label htmlFor="bulk-apply-techs" className="cursor-pointer text-sm">
                    Apply Tech changes
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selecting no Tech clears all Tech assignments.
                  </p>
                </div>
              </div>
              <TechMultiSelect
                techs={techs?.results ?? []}
                value={techIds}
                onChange={setTechIds}
                placeholder="Select one or more Tech..."
                disabled={!applyTechs || isMutating}
              />
            </div>
          </SectionCard>

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
              description="Tri-state: unchanged (—) · on (✓) · off (☐)."
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

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isMutating}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!hasChanges || selectedCount === 0 || isMutating}
            >
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
