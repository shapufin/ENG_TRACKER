import React from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
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
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2.5">
    <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
    <dd className="min-w-0 text-sm">{children}</dd>
  </div>
);

const Empty = () => <span className="text-muted-foreground">—</span>;

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
}) => {
  if (!profile) return null;

  const username = profile.user?.username ?? "";
  const userId = profile.user?.id;
  const teams = profile.teams_detail ?? [];
  const techs = profile.techs_detail ?? [];
  const roles = profile.user?.roles ?? [];
  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" size="panel">
        <DialogHeader className="pr-12">
          <DialogTitle className="sr-only">User {username}</DialogTitle>
          <UserCell name={username} subtitle={profile.user?.email} />
          <DialogDescription className="sr-only">
            Read-only details. Use the buttons below to change this user.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-0 py-2">
          <dl className="divide-border/60 divide-y">
            <Fact label="Hire date">
              {profile.hire_date ? formatDateDDMMYYYY(profile.hire_date) : <Empty />}
            </Fact>
            <Fact label="Phone">{profile.phone || <Empty />}</Fact>
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
          </dl>
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
