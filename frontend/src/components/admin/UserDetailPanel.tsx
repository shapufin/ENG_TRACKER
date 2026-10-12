import React, { useState } from "react";
import { Check, KeyRound, Pencil, Trash2, X } from "lucide-react";
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
import { UserCell } from "@/components/admin/UserCell";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
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
  onSaveField?: (userId: number, payload: { phone?: string; hire_date?: string | null }) => void;
  isSaving?: boolean;
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2.5">
    <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
    <dd className="min-w-0 text-sm">{children}</dd>
  </div>
);

const Empty = () => <span className="text-muted-foreground">—</span>;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="py-1">
    <h3 className="text-muted-foreground px-0 pt-3 pb-1 text-xs font-semibold tracking-wider uppercase">
      {title}
    </h3>
    <dl className="divide-border/60 divide-y">{children}</dl>
  </section>
);

type EditableField = "phone" | "hire_date";

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
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2.5">
        <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
        <dd className="flex min-w-0 items-start justify-between gap-2 text-sm">
          <span className="min-w-0">{display}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => onStart(field)}
              aria-label={`Edit ${label.toLowerCase()} for ${username}`}
              title={`Edit ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-1 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </dd>
      </div>
    );
  }
  const saveLabel = `Save ${label.toLowerCase()}`;
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2.5">
      <dt className="text-muted-foreground pt-2 text-xs font-medium">
        <label htmlFor={`panel-${field}`}>{label}</label>
      </dt>
      <dd className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Input
            id={`panel-${field}`}
            type={inputType}
            value={draft}
            disabled={isSaving}
            onChange={(e) => setDraft(e.target.value)}
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
      </dd>
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
    else onSaveField(userId, { hire_date: value === "" ? null : value });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" size="panel">
        <DialogHeader className="pr-12">
          <DialogTitle className="sr-only">User {username}</DialogTitle>
          <UserCell name={username} subtitle={profile.user?.email} />
          <DialogDescription className="sr-only">
            Details. Phone and hire date can be edited inline; use the buttons below for everything
            else.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-0 py-2">
          <Section title="Contact">
            <EditableFact
              key={`hire_date-${editing === "hire_date" ? "open" : "closed"}`}
              label="Hire date"
              field="hire_date"
              username={username}
              display={profile.hire_date ? formatDateDDMMYYYY(profile.hire_date) : <Empty />}
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
              key={`phone-${editing === "phone" ? "open" : "closed"}`}
              label="Phone"
              field="phone"
              username={username}
              display={profile.phone || <Empty />}
              currentValue={profile.phone ?? ""}
              inputType="tel"
              editing={editing}
              onStart={setEditing}
              onCancel={() => setEditing(null)}
              onSave={saveField("phone")}
              isSaving={isSaving}
              canEdit={canSaveField}
            />
          </Section>
          <Section title="Teams & tech">
            <Fact label="Teams">
              {teams.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {teams.map((t) => (
                    <Badge key={t.id} variant="secondary" className="text-xs font-normal">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Fact>
            <Fact label="Tech">
              {techs.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {techs.map((t) => (
                    <Badge key={t.id} variant="outline" className="text-xs font-normal">
                      {t.name}
                      {t.level && <span className="ml-1 font-semibold">{t.level.code}</span>}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Fact>
          </Section>
          <Section title="Leadership & roles">
            <Fact label="Italian TL">{profile.italian_tl_name || <Empty />}</Fact>
            <Fact label="Albanian TL">{profile.albanian_tl_name || <Empty />}</Fact>
            <Fact label="Roles">
              {roles.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary" className="text-xs font-normal">
                      {role}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Fact>
          </Section>
        </DialogBody>

        <DialogFooter className="justify-between gap-2 sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="destructive"
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
              disabled={userId === undefined}
              onClick={act(() => userId !== undefined && onReset(userId))}
              aria-label={`Reset password for ${username}`}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Reset password
            </Button>
            <Button
              type="button"
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
