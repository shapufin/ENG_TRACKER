/**
 * AnalyticsSidebarItem — sidebar nav item for the app layout (user shell).
 *
 * Links to /analytics so non-admin users open Analytics within the
 * AppShell. Delegates rendering to the shared `SidebarNavLink`, which
 * handles collapsed-mode active indicator + portal tooltip behavior.
 */
import React from "react";
import { useLocation } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";

const AnalyticsSidebarItem: React.FC = () => {
  const location = useLocation();
  const { canView } = usePluginPermissions();
  const isActive =
    location.pathname === "/analytics" || location.pathname.startsWith("/analytics/");

  if (!canView("analytics")) return null;

  return <SidebarNavLink to="/analytics" label="Analytics" icon={BarChart3} isActive={isActive} />;
};

export default AnalyticsSidebarItem;
