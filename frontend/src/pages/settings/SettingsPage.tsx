import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { usePlugins } from "@/context/PluginContext";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogOut, Lock, User, Users } from "lucide-react";
import { toast } from "sonner";
import { MyClientsSection } from "./components/MyClientsSection";
import { ClientAssignmentSection } from "./components/ClientAssignmentSection";
import { NotificationPreferencesSection } from "./components/NotificationPreferencesSection";
// Plugin boundary exception: CR user scope display. See CONTEXT.md
// "Plugin Boundary — Accepted Exception" section. If the control_room
// plugin is removed, drop this import and the CRScopeCard render branch.
import { useControlRoomMe } from "@/plugins/control_room/hooks/useControlRoomAccess";

export const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isTeamLeader } = usePermissions();
  const { activePlugins } = usePlugins();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const isCRScoped = isCRUser || isCROnlyAdmin;
  const notificationsActive = activePlugins.some((plugin) => plugin.name === "notifications");
  const navigate = useNavigate();
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwordForm.new.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    toast.info("Password change not yet implemented on backend");
    setPasswordForm({ current: "", new: "", confirm: "" });
  };

  const getRoleBadges = (): string[] => {
    const badges: string[] = [];
    if (isAdmin || isSuperuser || user?.is_staff) badges.push("Admin");
    if (isHR || user?.is_hr) badges.push("HR");
    if (isTeamLeader || user?.is_team_leader) badges.push("Team Leader");
    // Show "CR Admin" only for scoped CR admins (not full staff/superusers,
    // for whom is_cr_admin() returns True by hierarchy). The isCROnlyAdmin
    // check ensures multi-role users with a higher role don't get a
    // duplicate badge alongside "Admin".
    if (isCROnlyAdmin) badges.push("CR Admin");
    if (isCRUser) badges.push("CR User");
    return badges;
  };

  return (
    <PageShell title="Settings" className="mx-auto max-w-2xl p-4">
      {/* Profile Card */}
      <GlassCard delay={0}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Username</Label>
              <p className="font-medium">{user?.username || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="font-medium">{user?.email || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">First Name</Label>
              <p className="font-medium">{user?.first_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last Name</Label>
              <p className="font-medium">{user?.last_name || "—"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {getRoleBadges().map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            {getRoleBadges().length === 0 && <Badge variant="outline">User</Badge>}
          </div>
        </CardContent>
      </GlassCard>

      {/* Theme Card */}
      <GlassCard delay={0.05}>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </GlassCard>

      {/* CR User Scope — read-only team list managed by CR admin.
          CR users don't self-assign clients (no overtime/KPI uploads),
          so MyClientsSection is hidden for them. Their team scope is
          assigned by a CR admin or full admin via the access management
          page. See CONTEXT.md rule 11. */}
      {/* CR User Scope — read-only team list managed by CR admin.
          Shown only for CR users (non-admin with ControlRoomAccess),
          not CR-only admins. CR admins manage scopes for others via
          the access management page; they don't need a self-scope card. */}
      {isCRUser && <CRScopeCard />}

      {/* My Clients — self-assign which clients the user works for.
          Hidden for CR-scoped identities: they only view standby for their
          scoped teams and have no client-selection workflow. */}
      {!isCRScoped && (
        <MyClientsSection
          assignedClientIds={user?.client_ids ?? []}
          onAssignedChange={refreshUser}
        />
      )}

      {/* TL Client Assignment — TLs assign team members to clients (mockup
          TL/settings.html). Hidden for CR-scoped identities (no client
          workflow) and non-TLs; self-service MyClientsSection above is
          untouched (last-write-wins). */}
      {isTeamLeader && !isCRScoped && <ClientAssignmentSection />}

      {notificationsActive && !isCRScoped && <NotificationPreferencesSection />}

      {/* Password Card */}
      <GlassCard delay={0.1}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <Label htmlFor="password-current">Current Password</Label>
              <Input
                id="password-current"
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="password-new">New Password</Label>
              <Input
                id="password-new"
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm((f) => ({ ...f, new: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="password-confirm">Confirm New Password</Label>
              <Input
                id="password-confirm"
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            <Button type="submit">Update Password</Button>
          </form>
        </CardContent>
      </GlassCard>

      {/* Logout Card */}
      <GlassCard delay={0.15}>
        <CardContent className="pt-6">
          <Button variant="destructive" onClick={handleLogout} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
        </CardContent>
      </GlassCard>
    </PageShell>
  );
};

/** Read-only display of a CR user's assigned team scopes.
 * Team scopes are managed by CR admins / full admins via the access
 * management page — CR users cannot self-assign teams. */
const CRScopeCard: React.FC = () => {
  const { data, isLoading, isError } = useControlRoomMe();
  const teams = data?.access?.team_scopes ?? [];

  return (
    <GlassCard delay={0.07}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Control Room Scope
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your Control Room team scope is managed by an administrator. It determines which teams'
          standby coverage you can see on the Control Room dashboard.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">
            Could not load your team scope. Please try again later.
          </p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams assigned. Contact your administrator to get team scope assigned.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1.5">
                <Users className="h-3 w-3" />
                {t.team_name}
                {t.team_code && (
                  <span className="text-xs text-muted-foreground">({t.team_code})</span>
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
