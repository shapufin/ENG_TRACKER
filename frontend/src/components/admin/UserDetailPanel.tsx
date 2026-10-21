import React, { useState } from "react";
import { Check, KeyRound, Mail, Pencil, Phone, Shield, Trash2, Users, X } from "lucide-react";
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
  DetailDrawerHero,
  DetailDrawerSection,
  DetailDrawerRow,
  DetailDrawerEmpty,
} from "@/components/ui/DetailDrawer";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { UserProfile } from "@/types";

interface UserDetailPanelProps {
  /** Row from the already-loaded users list. Null closes the panel. */
  profile: UserProfile | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (profile: UserProfile) => void;
  onReset: (userId: number) => void;
  onDelete: (profile: UserProfile) => void;
  /**
   * Inline save for revocation-free scalar fields (phone, hire date only —
   * never roles or TL assignments, which must keep going through the full
   * edit dialog's blocked-revocation handling).
   */
  onSaveField?: (
    userId: number,
    payload: { phone?: string; code?: string; hire_date?: string | null }
  ) => void;
  isSaving?: boolean;
}

type EditableField = "phone" | "code" | "hire_date";

/**
 * One scalar fact with an inline edit affordance. Editing stays local until
 * Save; the editor closes on save (a failed save surfaces through the page's
 * error toast and the row keeps its old value, so nothing is lost silently).
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

/**
 * Record detail side panel for one user. Reads only the row it is given (no
 * request on open). Edit, reset and delete delegate to the page's existing
 * handlers, so confirmation and permissions stay where they already live.
 */
export const UserDetailPanel: React.FC<UserDetailPanelProps> = ({
  profile,
  onOpenChange,
  onEdit,
  onReset,
  onDelete,
  onSaveField,
  isSaving = false,
}) => {
  const [editing, setEditing] = useState<EditableField | null>(null);
  if (!profile) return null;

  const username = profile.user?.username ?? "";
  const userId = profile.user?.id;
  const teams = profile.teams_detail ?? [];
  const techs = profile.techs_detail ?? [];
  const roles = profile.user?.roles ?? [];
  const canSaveField = onSaveField !== undefined && userId !== undefined;

  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const saveField = (field: EditableField) => (value: string) => {
    if (!onSaveField || userId === undefined) return;
    if (field === "phone") onSaveField(userId, { phone: value });
    else if (field === "code") onSaveField(userId, { code: value });
    else onSaveField(userId, { hire_date: value === "" ? null : value });
  };

  const isItalianTL = profile.is_italian_tl_role || roles.includes("italian_tl");
  const isAlbanianTL = profile.is_albanian_tl_role || roles.includes("albanian_tl");
  const isHbpr = roles.includes("hbpr");

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
            Details. Phone and hire date can be edited inline; use the buttons below for everything
            else.
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
            <DetailDrawerRow label="Teams">
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
            <DetailDrawerRow label="Tech">
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
          </DetailDrawerSection>

          <DetailDrawerSection id="user-leadership" title="Leadership & roles" icon={Shield}>
            <DetailDrawerRow label="Italian TL">
              {profile.italian_tl_name || <DetailDrawerEmpty />}
            </DetailDrawerRow>
            <DetailDrawerRow label="Albanian TL">
              {profile.albanian_tl_name || <DetailDrawerEmpty />}
            </DetailDrawerRow>
            <DetailDrawerRow label="Roles">
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
          </DetailDrawerSection>

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
