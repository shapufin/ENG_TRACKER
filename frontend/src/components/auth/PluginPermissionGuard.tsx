import React from "react";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { useAuth } from "@/context/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { AlertCircle, Lock } from "lucide-react";

interface PluginPermissionGuardProps {
  pluginName: string;
  action?: "view" | "manage" | "configure" | "export";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Guard component that checks if user has permission to access a plugin.
 *
 * If user doesn't have permission, shows an access denied message.
 * If loading, shows a loading state.
 * If not authenticated, shows authentication required message.
 */
export const PluginPermissionGuard: React.FC<PluginPermissionGuardProps> = ({
  pluginName,
  action = "view",
  children,
  fallback,
}) => {
  const { isAuthenticated, user } = useAuth();
  const { isLoading, hasPermission } = usePluginPermissions();

  // Show authentication required if not authenticated
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <GlassCard>
        <div className="flex items-center gap-4 p-8">
          <div className="bg-tone-warning-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
            <Lock className="text-tone-warning-text h-6 w-6" />
          </div>
          <div>
            <h3 className="text-foreground font-semibold">Authentication Required</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Please log in to access this plugin.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (isLoading) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="border-primary inline-block h-8 w-8 animate-spin rounded-full border-4 border-r-transparent"></div>
            <p className="text-muted-foreground mt-4 text-sm">Loading permissions...</p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Staff and superuser always have access (fallback when plugin permissions not configured)
  const isStaffOrSuperuser = user?.is_staff || user?.is_superuser;
  const hasAccess = isStaffOrSuperuser || hasPermission(pluginName, action);

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <GlassCard>
        <div className="flex items-center gap-4 p-8">
          <div className="bg-tone-danger-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
            <AlertCircle className="text-tone-danger-text h-6 w-6" />
          </div>
          <div>
            <h3 className="text-foreground font-semibold">Access Denied</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              You don't have permission to {action} this plugin. Contact your administrator to
              request access.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return <>{children}</>;
};
