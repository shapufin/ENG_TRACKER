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
import { FormDialog } from "@/components/ui/FormDialog";
import { LogOut, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { MyClientsSection } from "./components/MyClientsSection";
import { ClientAssignmentSection } from "./components/ClientAssignmentSection";
import { PushNotificationSection } from "./components/PushNotificationSection";
import { NotificationPreferencesSection } from "./components/NotificationPreferencesSection";
import { PluginCRScopeCard } from "./components/PluginCRScopeCard";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Owns the single `usePushNotifications()` call shared by both cards, so
 * the service-worker-ready/getSubscription() check runs once per page load
 * instead of once per card — and only mounts (so only runs) when the
 * notifications plugin is active and the viewer isn't CR-scoped, matching
 * the visibility rule both cards were already gated on. */
const NotificationSettingsGroup: React.FC<{ isTeamLeader: boolean }> = ({ isTeamLeader }) => {
  const pushState = usePushNotifications();
  return (
    <>
      {isTeamLeader ? (
        <PushNotificationSection pushState={pushState} />
      ) : (
        <div className="lg:col-span-2">
          <PushNotificationSection pushState={pushState} />
        </div>
      )}
      <div className="lg:col-span-2">
        <NotificationPreferencesSection
          isSubscribed={pushState.isSubscribed}
          isSubscribing={pushState.isSubscribing}
        />
      </div>
    </>
  );
};

export const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isTeamLeader } = usePermissions();
  const { activePlugins } = usePlugins();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const isCRScoped = isCRUser || isCROnlyAdmin;
  const notificationsActive = activePlugins.some((plugin) => plugin.name === "notifications");
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
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
    setPasswordOpen(false);
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
    <PageShell title="Settings">
      {/* Single flat grid: paired cards are direct children so each row
          stretches to the taller card (items-stretch) and bottoms stay
          aligned no matter how long a card's copy runs. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
            <div className="flex flex-wrap pt-1">
              {/* Filled primary (not outline): matches the other card action
                  buttons and stays clearly visible on first visit. */}
              <Button onClick={() => setPasswordOpen(true)}>
                <Lock className="mr-2 h-4 w-4" />
                Change Password
              </Button>
            </div>
            {(user?.techs?.length ?? 0) > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Tech</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {user!.techs!.map((tech) => (
                    <Badge key={tech.id} variant="outline" title={tech.code}>
                      {tech.name}
                      {tech.level && (
                        <span className="ml-1 font-semibold" title={tech.level.name}>
                          {tech.level.code}
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </GlassCard>

        {/* My Clients — self-assign which clients the user works for.
            Hidden for CR-scoped identities: they only view standby for their
            scoped teams and have no client-selection workflow. */}
        {!isCRScoped && (
          <MyClientsSection
            assignedClientIds={user?.client_ids ?? []}
            onAssignedChange={refreshUser}
          />
        )}

        {/* CR User Scope — read-only team list managed by CR admin.
            Shown only for CR users (non-admin with ControlRoomAccess),
            not CR-only admins. CR admins manage scopes for others via
            the access management page; they don't need a self-scope card. */}
        {isCRUser && <PluginCRScopeCard />}

        {/* Row 2 pair: Push Notifications | Client Assignment. For TLs
            both cards sit side by side; for everyone else (no Client
            Assignment card) Push Notifications takes the full row so no
            half-width hole is left. Which notification event types exist
            at all is a global admin switch (Django admin / notification
            event configs); Push Notifications is the per-device on/off;
            Notification Preferences below is the per-category, per-channel
            self-service control. */}
        {notificationsActive && !isCRScoped && (
          <NotificationSettingsGroup isTeamLeader={isTeamLeader} />
        )}

        {/* TL Client Assignment — TLs assign team members to clients (mockup
            TL/settings.html). Paired with Notification Preferences above.
            Hidden for CR-scoped identities (no client workflow) and non-TLs;
            self-service MyClientsSection above is untouched
            (last-write-wins). */}
        {isTeamLeader && !isCRScoped && <ClientAssignmentSection />}
      </div>

      {/* Change Password — opens in a FormDialog (dialog contract: scroll
          region, header/footer, labels wired via htmlFor/id). The backend
          endpoint is not implemented yet; validation behavior is unchanged. */}
      <FormDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        title="Change Password"
        description="Choose a new password for your account."
        onSubmit={handlePasswordChange}
        submitLabel="Update Password"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password-current">Current Password</Label>
            <Input
              id="password-current"
              type="password"
              autoComplete="current-password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-new">New Password</Label>
            <Input
              id="password-new"
              type="password"
              autoComplete="new-password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm((f) => ({ ...f, new: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-confirm">Confirm New Password</Label>
            <Input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
        </div>
      </FormDialog>

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
