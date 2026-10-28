import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useMaintenanceStatus } from "@/hooks/useMaintenanceStatus";

/**
 * Persistent reminder while the site is closed. Lives in `AdminShell` so an
 * admin cannot forget the switch after navigating away from Global Settings.
 * Amber tone tokens carry both themes — no `dark:` variants.
 */
export const MaintenanceBanner: React.FC = () => {
  const { data } = useMaintenanceStatus();
  if (!data?.active) return null;

  return (
    <div
      role="status"
      className="border-tone-warning-border bg-tone-warning-surface text-tone-warning-text mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Maintenance mode is ON.</strong> Every non-admin is locked
        out of the platform.
      </span>
      <Link
        to="/admin/global-settings?tab=maintenance"
        className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-4"
      >
        Manage
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
};
