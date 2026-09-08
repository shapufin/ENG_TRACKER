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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Lock className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Authentication Required</h3>
            <p className="mt-1 text-sm text-muted-foreground">
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
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
            <p className="mt-4 text-sm text-muted-foreground">Loading permissions...</p>
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Access Denied</h3>
            <p className="mt-1 text-sm text-muted-foreground">
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
