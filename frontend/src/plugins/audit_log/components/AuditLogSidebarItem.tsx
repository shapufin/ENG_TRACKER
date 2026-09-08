import React from "react";
import { FileSearch } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { usePermissions } from "@/context/PermissionContext";

const AuditLogSidebarItem: React.FC = () => {
  const location = useLocation();
  const { canView } = usePluginPermissions();
  const { isAdmin, isSuperuser, isHR, isTeamLeader, isCRAdmin } = usePermissions();
  const isActive = location.pathname.startsWith("/admin/audit-logs");

  // CR-only admins are scoped to /admin/users and /admin/control-room/* only.
  // They must not see non-CR admin plugins in the Extensions flyout, even if
  // is_public=True grants them plugin view permission.
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  if (isCROnlyAdmin || !canView("audit_log")) return null;

  return (
    <li>
      <Link
        to="/admin/audit-logs"
        role="menuitem"
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <FileSearch className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Audit Logs</span>
      </Link>
    </li>
  );
};

export default AuditLogSidebarItem;
