import React from "react";
import { useNavigate } from "react-router-dom";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { usePlugins } from "@/context/PluginContext";
import { Badge } from "@/components/ui/badge";
import { LogOut, User } from "lucide-react";
import { MyClientsSection } from "./components/MyClientsSection";
import { ClientAssignmentSection } from "./components/ClientAssignmentSection";
import { NotificationPreferencesSection } from "./components/NotificationPreferencesSection";
import { PluginCRScopeCard } from "./components/PluginCRScopeCard";
import { PasswordRow } from "./components/PasswordRow";
import { TwoFactorSection } from "./components/TwoFactorSection";

export const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const {
    isCRUser,
    isCRAdmin,
    isAdmin,
    isSuperuser,
    isHR,
    isHROnly,
    isHBPR,
    isTeamLeader,
    isHBPROnly,
  } = usePermissions();
  const { activePlugins } = usePlugins();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const isCRScoped = isCRUser || isCROnlyAdmin;
  // `isHBPROnly` is the shared flag (mirrors the backend's `is_hbpr_only`): an
  // HBPR has no overtime or standby, so there are no clients to work for.
  const notificationsActive = activePlugins.some((plugin) => plugin.name === "notifications");
  const showAssignment = isTeamLeader && !isCRScoped;
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getRoleBadges = (): string[] => {
    const badges: string[] = [];
    if (isAdmin || isSuperuser || user?.is_staff) badges.push("Admin");
    if (isHR || user?.is_hr) badges.push("HR");
    if (isTeamLeader || user?.is_team_leader) badges.push("Team Leader");
    if (isHBPR) badges.push("HBPR");
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
                <Label className="text-muted-foreground text-xs">Username</Label>
                <p className="font-medium">{user?.username || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Email</Label>
                <p className="font-medium">{user?.email || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">First Name</Label>
                <p className="font-medium">{user?.first_name || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Last Name</Label>
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
            {/* Security: the two account protections, compact but never hidden. */}
            <div className="space-y-2 border-t pt-4" role="group" aria-label="Security">
              <PasswordRow />
              <TwoFactorSection />
            </div>
            {(user?.techs?.length ?? 0) > 0 && (
              <div>
                <Label className="text-muted-foreground text-xs">Tech</Label>
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
            Hidden for CR-scoped identities (no client-selection workflow) and
            pure HR (no overtime/standby forms to scope). */}
        {!isCRScoped && !isHBPROnly && !isHROnly && (
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

        {/* Notification Preferences — per-category in-app toggles. Paired
            side-by-side with Client Assignment below; spans full width only
            when the assignment card is hidden (non-TL). */}
        {notificationsActive && !isCRScoped && (
          <div className={showAssignment ? undefined : "lg:col-span-2"}>
            <NotificationPreferencesSection />
          </div>
        )}

        {/* TL Client Assignment — TLs assign team members to clients (mockup
            TL/settings.html). Paired with Notification Preferences above.
            Hidden for CR-scoped identities (no client workflow) and non-TLs;
            self-service MyClientsSection above is untouched
            (last-write-wins). */}
        {showAssignment && <ClientAssignmentSection />}
      </div>

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
