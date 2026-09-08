import React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Shield,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GlassCard } from "@/components/ui/GlassCard";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AudienceMode, GroupMini, RoleMini } from "../types";

const audienceLabels: Record<AudienceMode, string> = {
  all_authenticated: "All authenticated users",
  selected: "Selected roles or groups",
  private_admin: "Administrators only",
};

interface OrganigramaPublishAudienceCardProps {
  audienceMode: AudienceMode;
  roles: RoleMini[];
  rolesLoading: boolean;
  selectedRoles: string[];
  groups: GroupMini[];
  groupsLoading: boolean;
  groupSearch: string;
  groupPage: number;
  totalGroupPages: number;
  selectedGroups: number[];
  dirty: boolean;
  audienceIsValid: boolean;
  isSaving: boolean;
  error: string | null;
  onAudienceModeChange: (value: AudienceMode) => void;
  onToggleRole: (code: string) => void;
  onToggleGroup: (groupId: number) => void;
  onGroupSearchChange: (value: string) => void;
  onGroupPageChange: (page: number) => void;
  onSave: () => void;
}

export const OrganigramaPublishAudienceCard: React.FC<OrganigramaPublishAudienceCardProps> = ({
  audienceMode,
  roles,
  rolesLoading,
  selectedRoles,
  groups,
  groupsLoading,
  groupSearch,
  groupPage,
  totalGroupPages,
  selectedGroups,
  dirty,
  audienceIsValid,
  isSaving,
  error,
  onAudienceModeChange,
  onToggleRole,
  onToggleGroup,
  onGroupSearchChange,
  onGroupPageChange,
  onSave,
}) => (
  <GlassCard className="space-y-6 p-4">
    <div>
      <h2 className="text-lg font-semibold">Audience</h2>
      <p className="text-sm text-muted-foreground">
        Choose who can view the published chart. Audience groups are used only for chart visibility
        and do not change group permissions.
      </p>
    </div>

    <div className="space-y-2">
      <Label>Audience mode</Label>
      <Select
        value={audienceMode}
        onValueChange={(value) => onAudienceModeChange(value as AudienceMode)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select audience mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all_authenticated">
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> {audienceLabels.all_authenticated}
            </span>
          </SelectItem>
          <SelectItem value="selected">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" /> {audienceLabels.selected}
            </span>
          </SelectItem>
          <SelectItem value="private_admin">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> {audienceLabels.private_admin}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    {audienceMode === "selected" && (
      <div className="space-y-4 rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">
          Matching any selected role <strong>OR</strong> any selected group grants visibility.
        </p>
        <div className="space-y-2">
          <Label>Roles</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {rolesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              roles.map((role) => (
                <div key={role.code} className="flex items-center space-x-2">
                  <Checkbox
                    id={`role-${role.code}`}
                    checked={selectedRoles.includes(role.code)}
                    onCheckedChange={() => onToggleRole(role.code)}
                  />
                  <Label htmlFor={`role-${role.code}`} className="text-sm font-normal">
                    {role.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </div>
        <Separator />
        <div className="space-y-2">
          <Label>Resource-access groups</Label>
          <Input
            placeholder="Search groups..."
            value={groupSearch}
            onChange={(e) => onGroupSearchChange(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto rounded border p-2">
            {groupsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups found.</p>
            ) : (
              <div className="grid gap-2">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`group-${group.id}`}
                      checked={selectedGroups.includes(group.id)}
                      onCheckedChange={() => onToggleGroup(group.id)}
                    />
                    <Label htmlFor={`group-${group.id}`} className="text-sm font-normal">
                      {group.name} <span className="text-muted-foreground">({group.code})</span>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
          {totalGroupPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Previous group page"
                onClick={() => onGroupPageChange(Math.max(1, groupPage - 1))}
                disabled={groupPage === 1 || groupsLoading}
              >
                <ChevronLeft className="mr-1 h-3 w-3" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {groupPage} of {totalGroupPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Next group page"
                onClick={() => onGroupPageChange(Math.min(totalGroupPages, groupPage + 1))}
                disabled={groupPage >= totalGroupPages || groupsLoading}
              >
                Next <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        {dirty && !audienceIsValid && (
          <p className="text-sm text-destructive">Select at least one role or group.</p>
        )}
      </div>
    )}

    <Button onClick={onSave} disabled={!dirty || (audienceMode === "selected" && !audienceIsValid)}>
      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save audience
    </Button>
    {error && (
      <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
        <p className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      </div>
    )}
  </GlassCard>
);
