import React, { useState } from "react";
import {
  Check,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DetailDrawerHero,
  DetailDrawerSection,
  DetailDrawerRow,
  DetailDrawerEmpty,
} from "@/components/ui/DetailDrawer";
import { TeamMultiSelect } from "@/components/admin/TeamMultiSelect";
import { TechMultiSelect } from "@/components/admin/TechMultiSelect";
import { FormRoleCheckboxes } from "@/pages/admin/components/userFormFields";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import { toTechAssignments } from "@/pages/admin/hooks/useUsersPage";
import type { Tech, TechAssignmentInput, UserProfile } from "@/types";

export interface UserDetailSavePayload {
  phone?: string;
  code?: string | null;
  hire_date?: string | null;
  teams?: number[];
  techs?: TechAssignmentInput[];
  italian_tl?: number | null;
  albanian_tl?: number | null;
  is_hr?: boolean;
  is_italian_tl_role?: boolean;
  is_albanian_tl_role?: boolean;
  is_cr_admin?: boolean;
  roles?: string[];
  mfa_required?: boolean;
}

interface TeamOption {
  id: number;
  name: string;
  code: string;
  parent_team?: number | null;
}

interface LeaderOption {
  id: number;
  username: string;
  full_name: string;
}

interface UserDetailPanelProps {
  /** Row from the already-loaded users list. Null closes the panel. */
  profile: UserProfile | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (profile: UserProfile) => void;
  onReset: (userId: number) => void;
  /** Ask to remove this person's second factor (the page owns the confirmation). */
  onResetMfa?: (profile: UserProfile) => void;
  onDelete: (profile: UserProfile) => void;
  /** Inline save for fields in the detail panel. */
  onSaveField?: (userId: number, payload: UserDetailSavePayload) => void;
  isSaving?: boolean;
  teamsData?: TeamOption[];
  techsData?: Tech[];
  italianTLs?: LeaderOption[];
  albanianTLs?: LeaderOption[];
  currentUser?: { id?: number; username?: string } | null;
  onNavigateToSettings?: () => void;
}

type EditableField =
  | "phone"
  | "code"
  | "hire_date"
  | "teams"
  | "techs"
  | "italian_tl"
  | "albanian_tl"
  | "roles";

/**
 * One scalar fact with an inline edit affordance. Editing stays local until
 * Save; the editor closes on save.
 */
const EditableFact: React.FC<{
  label: string;
  field: EditableField;
  username: string;
  display: React.ReactNode;
  currentValue: string;
  inputType?: string;
  editing: EditableField | null;
  onStart: (field: EditableField) => void;
  onCancel: () => void;
  onSave: (value: string) => void;
  isSaving?: boolean;
  canEdit: boolean;
}> = ({
  label,
  field,
  username,
  display,
  currentValue,
  inputType = "text",
  editing,
  onStart,
  onCancel,
  onSave,
  isSaving = false,
  canEdit,
}) => {
  const [draft, setDraft] = useState(currentValue);
  const isOpen = editing === field;

  if (!isOpen) {
    return (
      <DetailDrawerRow
        label={label}
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="control-icon-sm"
              onClick={() => onStart(field)}
              aria-label={`Edit ${label.toLowerCase()} for ${username}`}
              title={`Edit ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )
        }
      >
        {display}
      </DetailDrawerRow>
    );
  }

  const saveLabel = `Save ${label.toLowerCase()}`;
  return (
    <div className="border-border/40 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground text-xs font-medium">
        <label htmlFor={`panel-${field}`}>{label}</label>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Input
            id={`panel-${field}`}
            type={inputType}
            value={draft}
            disabled={isSaving}
            onChange={(e) => setDraft(e.target.value)}
            controlSize="sm"
            className="text-xs"
          />
          <Button
            type="button"
            size="control-icon-sm"
            aria-label={saveLabel}
            title={saveLabel}
            disabled={isSaving || draft === currentValue}
            onClick={() => {
              onSave(draft);
              onCancel();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="control-icon-sm"
            variant="ghost"
            aria-label={`Cancel editing ${label.toLowerCase()}`}
            title="Cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const EditableTeams: React.FC<{
  username: string;
  teams: { id: number; name: string }[];
  allTeams: TeamOption[];
  currentValue: number[];
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (teamIds: number[]) => void;
  isSaving?: boolean;
  canEdit: boolean;
}> = ({
  username,
  teams,
  allTeams,
  currentValue,
  editing,
  onStart,
  onCancel,
  onSave,
  isSaving = false,
  canEdit,
}) => {
  const [draft, setDraft] = useState<number[]>(currentValue);

  if (!editing) {
    return (
      <DetailDrawerRow
        label="Teams"
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="control-icon-sm"
              onClick={onStart}
              aria-label={`Edit teams for ${username}`}
              title="Edit teams"
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )
        }
      >
        {teams.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-xs font-normal">
                {t.name}
              </Badge>
            ))}
          </div>
        ) : (
          <DetailDrawerEmpty />
        )}
      </DetailDrawerRow>
    );
  }

  const isChanged =
    draft.length !== currentValue.length || draft.some((id) => !currentValue.includes(id));

  return (
    <div className="border-border/40 grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground pt-2 text-xs font-medium">Teams</span>
      <div className="min-w-0 space-y-2">
        <TeamMultiSelect
          teams={allTeams}
          value={draft}
          onChange={setDraft}
          placeholder="No team"
          disabled={isSaving}
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            size="control-icon-sm"
            aria-label="Save teams"
            title="Save teams"
            disabled={isSaving || !isChanged}
            onClick={() => {
              onSave(draft);
              onCancel();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="control-icon-sm"
            variant="ghost"
            aria-label="Cancel editing teams"
            title="Cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const EditableTechs: React.FC<{
  username: string;
  techs: { id: number; name: string; level?: { code: string; id: number } | null }[];
  allTechs: Tech[];
  currentTechIds: number[];
  currentLevels: Record<number, number | null>;
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (techIds: number[], levels: Record<number, number | null>) => void;
  isSaving?: boolean;
  canEdit: boolean;
}> = ({
  username,
  techs,
  allTechs,
  currentTechIds,
  currentLevels,
  editing,
  onStart,
  onCancel,
  onSave,
  isSaving = false,
  canEdit,
}) => {
  const [draftTechIds, setDraftTechIds] = useState<number[]>(currentTechIds);
  const [draftLevels, setDraftLevels] = useState<Record<number, number | null>>(currentLevels);

  if (!editing) {
    return (
      <DetailDrawerRow
        label="Tech"
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="control-icon-sm"
              onClick={onStart}
              aria-label={`Edit tech for ${username}`}
              title="Edit tech"
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )
        }
      >
        {techs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {techs.map((t) => (
              <Badge key={t.id} variant="outline" className="text-xs font-normal">
                {t.name}
                {t.level && <span className="ml-1 font-semibold">{t.level.code}</span>}
              </Badge>
            ))}
          </div>
        ) : (
          <DetailDrawerEmpty />
        )}
      </DetailDrawerRow>
    );
  }

  return (
    <div className="border-border/40 grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground pt-2 text-xs font-medium">Tech</span>
      <div className="min-w-0 space-y-2">
        <TechMultiSelect
          techs={allTechs}
          value={draftTechIds}
          onChange={setDraftTechIds}
          levelByTech={draftLevels}
          onLevelChange={(techId, levelId) =>
            setDraftLevels((prev) => ({ ...prev, [techId]: levelId }))
          }
          placeholder="No Tech"
          disabled={isSaving}
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            size="control-icon-sm"
            aria-label="Save tech"
            title="Save tech"
            disabled={isSaving}
            onClick={() => {
              onSave(draftTechIds, draftLevels);
              onCancel();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="control-icon-sm"
            variant="ghost"
            aria-label="Cancel editing tech"
            title="Cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const EditableTL: React.FC<{
  label: string;
  field: "italian_tl" | "albanian_tl";
  username: string;
  leaderName?: string | null;
  currentValue: string;
  tls: LeaderOption[];
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
  isSaving?: boolean;
  canEdit: boolean;
}> = ({
  label,
  field,
  username,
  leaderName,
  currentValue,
  tls,
  editing,
  onStart,
  onCancel,
  onSave,
  isSaving = false,
  canEdit,
}) => {
  const [draft, setDraft] = useState(currentValue);

  if (!editing) {
    return (
      <DetailDrawerRow
        label={label}
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="control-icon-sm"
              onClick={onStart}
              aria-label={`Edit ${label.toLowerCase()} for ${username}`}
              title={`Edit ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )
        }
      >
        {leaderName || <DetailDrawerEmpty />}
      </DetailDrawerRow>
    );
  }

  const saveLabel = `Save ${label.toLowerCase()}`;
  return (
    <div className="border-border/40 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground text-xs font-medium">
        <label htmlFor={`panel-${field}`}>{label}</label>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Select value={draft} onValueChange={setDraft} disabled={isSaving}>
            <SelectTrigger id={`panel-${field}`} controlSize="sm" className="text-xs">
              <SelectValue placeholder="No TL" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No TL</SelectItem>
              {tls.map((tl) => (
                <SelectItem key={tl.id} value={String(tl.id)}>
                  {tl.full_name || tl.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="control-icon-sm"
            aria-label={saveLabel}
            title={saveLabel}
            disabled={isSaving || draft === currentValue}
            onClick={() => {
              onSave(draft);
              onCancel();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="control-icon-sm"
            variant="ghost"
            aria-label={`Cancel editing ${label.toLowerCase()}`}
            title="Cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const EditableRoles: React.FC<{
  username: string;
  roles: string[];
  initialRoleState: {
    is_hr_user: boolean;
    is_italian_tl_role: boolean;
    is_albanian_tl_role: boolean;
    is_cr_admin: boolean;
    is_hbpr: boolean;
  };
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (roleState: {
    is_hr_user: boolean;
    is_italian_tl_role: boolean;
    is_albanian_tl_role: boolean;
    is_cr_admin: boolean;
    is_hbpr: boolean;
  }) => void;
  isSaving?: boolean;
  canEdit: boolean;
}> = ({
  username,
  roles,
  initialRoleState,
  editing,
  onStart,
  onCancel,
  onSave,
  isSaving = false,
  canEdit,
}) => {
  const [draft, setDraft] = useState(initialRoleState);

  if (!editing) {
    return (
      <DetailDrawerRow
        label="Roles"
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="control-icon-sm"
              onClick={onStart}
              aria-label={`Edit roles for ${username}`}
              title="Edit roles"
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )
        }
      >
        {roles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge key={role} variant="secondary" className="text-xs font-normal">
                {role}
              </Badge>
            ))}
          </div>
        ) : (
          <DetailDrawerEmpty />
        )}
      </DetailDrawerRow>
    );
  }

  const hbprMode = Boolean(draft.is_hbpr);
  const hiddenRevocations = [
    draft.is_italian_tl_role && "Italian TL",
    draft.is_albanian_tl_role && "Albanian TL",
    draft.is_cr_admin && "CR Admin",
  ].filter(Boolean) as string[];

  return (
    <div className="border-border/40 space-y-2 border-b py-2 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">Roles</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="control-icon-sm"
            aria-label="Save roles"
            title="Save roles"
            disabled={isSaving}
            onClick={() => {
              onSave(draft);
              onCancel();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="control-icon-sm"
            variant="ghost"
            aria-label="Cancel editing roles"
            title="Cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {hbprMode && hiddenRevocations.length > 0 && (
        <InfoCallout
          tone="warning"
          role="status"
          className="text-xs"
          label={`Saving with HBPR checked will revoke: ${hiddenRevocations.join(", ")}.`}
        />
      )}
      <FormRoleCheckboxes
        is_hr_user={draft.is_hr_user}
        is_italian_tl_role={draft.is_italian_tl_role}
        is_albanian_tl_role={draft.is_albanian_tl_role}
        is_cr_admin={draft.is_cr_admin}
        is_hbpr={draft.is_hbpr}
        hbprOnly={hbprMode}
        prefix="drawer"
        onChange={(key, val) => setDraft((prev) => ({ ...prev, [key]: val }))}
      />
    </div>
  );
};

/**
 * Record detail side panel for one user. Reads only the row it is given (no
 * request on open). Fields can be edited inline or via full edit modal.
 */
export const UserDetailPanel: React.FC<UserDetailPanelProps> = ({
  profile,
  onOpenChange,
  onEdit,
  onReset,
  onResetMfa,
  onDelete,
  onSaveField,
  isSaving = false,
  teamsData = [],
  techsData = [],
  italianTLs = [],
  albanianTLs = [],
  currentUser = null,
  onNavigateToSettings,
}) => {
  const [editing, setEditing] = useState<EditableField | null>(null);
  if (!profile) return null;

  const username = profile.user?.username ?? "";
  const userId = profile.user?.id;
  const isSelf = currentUser
    ? currentUser.id === userId || currentUser.username === username
    : false;
  const goToSettings = () => {
    if (onNavigateToSettings) {
      onNavigateToSettings();
    } else {
      window.location.href = "/settings";
    }
  };
  const teams = profile.teams_detail ?? [];
  const techs = profile.techs_detail ?? [];
  const roles = profile.user?.roles ?? [];
  const canSaveField = onSaveField !== undefined && userId !== undefined;

  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const saveField = (field: EditableField) => (value: unknown, extra?: unknown) => {
    if (!onSaveField || userId === undefined) return;
    if (field === "phone") {
      onSaveField(userId, { phone: value as string });
    } else if (field === "code") {
      onSaveField(userId, { code: (value as string) || null });
    } else if (field === "hire_date") {
      onSaveField(userId, { hire_date: (value as string) === "" ? null : (value as string) });
    } else if (field === "teams") {
      onSaveField(userId, { teams: value as number[] });
    } else if (field === "techs") {
      onSaveField(userId, {
        techs: toTechAssignments(
          value as number[],
          extra as Record<number, number | null> | undefined
        ),
      });
    } else if (field === "italian_tl") {
      const val = value as string;
      onSaveField(userId, { italian_tl: val && val !== "none" ? Number(val) : null });
    } else if (field === "albanian_tl") {
      const val = value as string;
      onSaveField(userId, { albanian_tl: val && val !== "none" ? Number(val) : null });
    } else if (field === "roles") {
      const draftRoles = value as {
        is_hr_user: boolean;
        is_italian_tl_role: boolean;
        is_albanian_tl_role: boolean;
        is_cr_admin: boolean;
        is_hbpr: boolean;
      };
      const rolesPayload = (
        draftRoles.is_hbpr
          ? [draftRoles.is_hr_user && "hr", "hbpr"]
          : [
              draftRoles.is_hr_user && "hr",
              draftRoles.is_italian_tl_role && "italian_tl",
              draftRoles.is_albanian_tl_role && "albanian_tl",
              draftRoles.is_cr_admin && "cr_admin",
              draftRoles.is_hbpr && "hbpr",
            ]
      ).filter(Boolean) as string[];
      onSaveField(userId, {
        roles: rolesPayload,
        is_hr: draftRoles.is_hr_user,
        is_italian_tl_role: draftRoles.is_hbpr ? false : draftRoles.is_italian_tl_role,
        is_albanian_tl_role: draftRoles.is_hbpr ? false : draftRoles.is_albanian_tl_role,
        is_cr_admin: draftRoles.is_hbpr ? false : draftRoles.is_cr_admin,
      });
    }
  };

  const isItalianTL = profile.is_italian_tl_role || roles.includes("italian_tl");
  const isAlbanianTL = profile.is_albanian_tl_role || roles.includes("albanian_tl");
  const isHbpr = roles.includes("hbpr");

  const initialRoleState = {
    is_hr_user: Boolean(profile.is_hr_user || roles.includes("hr")),
    is_italian_tl_role: Boolean(profile.is_italian_tl_role || roles.includes("italian_tl")),
    is_albanian_tl_role: Boolean(profile.is_albanian_tl_role || roles.includes("albanian_tl")),
    is_cr_admin: Boolean(profile.user?.is_cr_admin || roles.includes("cr_admin")),
    is_hbpr: Boolean(roles.includes("hbpr")),
  };

  const currentLevels = Object.fromEntries(
    (profile.techs_detail || []).map((entry) => [entry.id, entry.level?.id ?? null])
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" size="panel">
        <DialogHeader className="pr-12">
          <DialogTitle className="sr-only">User {username}</DialogTitle>
          <DetailDrawerHero
            name={username}
            subtitle={
              profile.user?.email ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{profile.user.email}</span>
                </span>
              ) : undefined
            }
            badges={
              <div className="flex flex-wrap items-center gap-1">
                {isItalianTL && (
                  <Badge
                    variant="default"
                    className={`${toneSurfaceClass.info} h-5 px-1.5 py-0 text-xs`}
                  >
                    IT TL
                  </Badge>
                )}
                {isAlbanianTL && (
                  <Badge
                    variant="default"
                    className={`${toneSurfaceClass.success} h-5 px-1.5 py-0 text-xs`}
                  >
                    AL TL
                  </Badge>
                )}
                {isHbpr && (
                  <Badge
                    variant="default"
                    className={`${toneSurfaceClass.accent} h-5 px-1.5 py-0 text-xs`}
                  >
                    HBPR
                  </Badge>
                )}
                {roles.length === 0 && (
                  <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs">
                    Member
                  </Badge>
                )}
              </div>
            }
          />
          <DialogDescription className="sr-only">
            Details for user {username}. Contact, teams, tech, leadership, and roles can be edited
            inline; use the buttons below for full edit, reset password, or delete.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-3">
          <DetailDrawerSection id="user-contact" title="Contact" icon={Phone}>
            <EditableFact
              key={`hire_date-${editing === "hire_date" ? "open" : "closed"}`}
              label="Hire date"
              field="hire_date"
              username={username}
              display={
                profile.hire_date ? formatDateDDMMYYYY(profile.hire_date) : <DetailDrawerEmpty />
              }
              currentValue={profile.hire_date ?? ""}
              inputType="date"
              editing={editing}
              onStart={setEditing}
              onCancel={() => setEditing(null)}
              onSave={saveField("hire_date")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
            <EditableFact
              key={`code-${editing === "code" ? "open" : "closed"}`}
              label="Code"
              field="code"
              username={username}
              display={
                profile.code ? (
                  <span className="font-mono text-xs">{profile.code}</span>
                ) : (
                  <DetailDrawerEmpty />
                )
              }
              currentValue={profile.code ?? ""}
              editing={editing}
              onStart={setEditing}
              onCancel={() => setEditing(null)}
              onSave={saveField("code")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
            <EditableFact
              key={`phone-${editing === "phone" ? "open" : "closed"}`}
              label="Phone"
              field="phone"
              username={username}
              display={profile.phone || <DetailDrawerEmpty />}
              currentValue={profile.phone ?? ""}
              inputType="tel"
              editing={editing}
              onStart={setEditing}
              onCancel={() => setEditing(null)}
              onSave={saveField("phone")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
          </DetailDrawerSection>

          <DetailDrawerSection id="user-teams-tech" title="Teams & tech" icon={Users}>
            <EditableTeams
              key={`teams-${editing === "teams" ? "open" : "closed"}`}
              username={username}
              teams={teams}
              allTeams={teamsData}
              currentValue={profile.teams ?? []}
              editing={editing === "teams"}
              onStart={() => setEditing("teams")}
              onCancel={() => setEditing(null)}
              onSave={saveField("teams")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
            <EditableTechs
              key={`techs-${editing === "techs" ? "open" : "closed"}`}
              username={username}
              techs={techs}
              allTechs={techsData}
              currentTechIds={profile.techs ?? []}
              currentLevels={currentLevels}
              editing={editing === "techs"}
              onStart={() => setEditing("techs")}
              onCancel={() => setEditing(null)}
              onSave={saveField("techs")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
          </DetailDrawerSection>

          <DetailDrawerSection id="user-leadership" title="Leadership & roles" icon={Shield}>
            <EditableTL
              key={`italian_tl-${editing === "italian_tl" ? "open" : "closed"}`}
              label="Italian TL"
              field="italian_tl"
              username={username}
              leaderName={profile.italian_tl_name}
              currentValue={profile.italian_tl ? String(profile.italian_tl) : "none"}
              tls={italianTLs}
              editing={editing === "italian_tl"}
              onStart={() => setEditing("italian_tl")}
              onCancel={() => setEditing(null)}
              onSave={saveField("italian_tl")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
            <EditableTL
              key={`albanian_tl-${editing === "albanian_tl" ? "open" : "closed"}`}
              label="Albanian TL"
              field="albanian_tl"
              username={username}
              leaderName={profile.albanian_tl_name}
              currentValue={profile.albanian_tl ? String(profile.albanian_tl) : "none"}
              tls={albanianTLs}
              editing={editing === "albanian_tl"}
              onStart={() => setEditing("albanian_tl")}
              onCancel={() => setEditing(null)}
              onSave={saveField("albanian_tl")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
            <EditableRoles
              key={`roles-${editing === "roles" ? "open" : "closed"}`}
              username={username}
              roles={roles}
              initialRoleState={initialRoleState}
              editing={editing === "roles"}
              onStart={() => setEditing("roles")}
              onCancel={() => setEditing(null)}
              onSave={saveField("roles")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
          </DetailDrawerSection>

          {profile.mfa_enabled !== undefined && (
            <DetailDrawerSection id="user-security" title="Security" icon={ShieldCheck}>
              <DetailDrawerRow
                label="Two-factor"
                action={
                  profile.mfa_enabled ? (
                    isSelf ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="control-sm"
                        onClick={goToSettings}
                        aria-label="Manage two-factor authentication in Settings"
                      >
                        Manage in Settings
                      </Button>
                    ) : onResetMfa ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="control-sm"
                        onClick={() => onResetMfa(profile)}
                        aria-label={`Reset two-factor authentication for ${username}`}
                      >
                        Reset two-factor
                      </Button>
                    ) : undefined
                  ) : isSelf ? (
                    <Button
                      type="button"
                      variant="default"
                      size="control-sm"
                      onClick={goToSettings}
                      aria-label="Set up two-factor authentication in Settings"
                    >
                      Set up two-factor
                    </Button>
                  ) : onSaveField && userId !== undefined ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="control-sm"
                      disabled={isSaving}
                      onClick={() => onSaveField(userId, { mfa_required: !profile.mfa_required })}
                      aria-label={
                        profile.mfa_required
                          ? `Remove two-factor requirement for ${username}`
                          : `Require two-factor authentication for ${username}`
                      }
                    >
                      {profile.mfa_required ? "Remove requirement" : "Require 2FA"}
                    </Button>
                  ) : undefined
                }
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={profile.mfa_enabled ? "default" : "secondary"}
                    className="text-xs font-normal"
                  >
                    {profile.mfa_enabled ? "On" : "Not set up"}
                  </Badge>
                  {profile.mfa_required && (
                    <Badge variant="outline" className="text-xs font-normal">
                      Required for this user
                    </Badge>
                  )}
                </div>
              </DetailDrawerRow>
            </DetailDrawerSection>
          )}

          <div className="border-border/50 bg-muted/30 rounded-xl border px-3 py-2">
            <p className="text-muted-foreground text-xs italic">
              Tip: assign roles from the team page, or edit them here.
            </p>
          </div>
        </DialogBody>

        <DialogFooter className="justify-between gap-2 sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            className="text-tone-danger-text hover:bg-tone-danger-surface hover:text-tone-danger-text min-h-11"
            onClick={act(() => onDelete(profile))}
            aria-label={`Delete user ${username}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={userId === undefined}
              onClick={act(() => userId !== undefined && onReset(userId))}
              aria-label={`Reset password for ${username}`}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Reset password
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={act(() => onEdit(profile))}
              aria-label={`Edit user ${username}`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
