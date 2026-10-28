import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MAINTENANCE_ACTIVE_EVENT, useMaintenanceStatus } from "@/hooks/useMaintenanceStatus";
import { MaintenancePage } from "./MaintenancePage";

/**
 * Renders the maintenance screen for everyone except staff admins.
 *
 * Placement matters: this sits inside `AuthProvider` but ABOVE
 * `PermissionProvider`/`PluginProvider`, so a locked-out user never mounts the
 * providers that fetch (their requests would 503 and toast behind the page).
 *
 * Fail-open: if the status request fails (backend down, offline) the app
 * renders normally — the existing offline handling owns that case, and a
 * maintenance page that cannot be verified must not lock anyone out.
 *
 * The only way to the sign-in form while closed is `/login?admin=1`, the link
 * the maintenance screen offers. Without that flag a signed-out visitor would
 * be bounced by `ProtectedRoute` to the login form and never see the
 * maintenance screen at all.
 */
export const MaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const { data: status, isError, refetch } = useMaintenanceStatus();
  const { pathname, search } = useLocation();
  const wasShowing = useRef(false);

  // Any API call that answers 503 code=maintenance flips this immediately,
  // instead of waiting up to 30s for the next poll.
  useEffect(() => {
    const onMaintenance = () => void refetch();
    window.addEventListener(MAINTENANCE_ACTIVE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_ACTIVE_EVENT, onMaintenance);
  }, [refetch]);

  const active = !isError && status?.active === true;
  const exempt = Boolean(user?.is_staff || user?.is_superuser);
  const adminEntry = pathname === "/login" && new URLSearchParams(search).get("admin") === "1";
  // `!authLoading`: until the session is restored we do not know whether this
  // is a staff admin, and showing the page first then swapping would both
  // flash and (before the guard below) trigger a reload loop on every boot.
  const showing = active && !authLoading && !exempt && !adminEntry;

  useEffect(() => {
    if (showing) {
      wasShowing.current = true;
      return;
    }
    // Maintenance ended while this tab was on the maintenance screen: come
    // back automatically. `!exempt` keeps a staff tab (which may have been
    // mistaken for a locked-out one while the session was still loading) from
    // reloading itself.
    if (wasShowing.current && !exempt) {
      wasShowing.current = false;
      window.location.reload();
    }
  }, [showing, exempt]);

  if (showing) {
    return <MaintenancePage status={status!} />;
  }

  return <>{children}</>;
};
