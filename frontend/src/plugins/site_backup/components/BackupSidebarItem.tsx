import React from "react";
import { DatabaseBackup } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";

const BackupSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isSuperuser } = usePermissions();
  const isActive = location.pathname.startsWith("/admin/backup-restore");

  // Superuser-only, matching the backend's hard gate: a full restore can
  // overwrite or delete any row, so this never opens up to staff/plugin
  // grants the way other plugin admin pages do.
  if (!isSuperuser) return null;

  return (
    <li>
      <Link
        to="/admin/backup-restore"
        role="menuitem"
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <DatabaseBackup className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Backup & Restore</span>
      </Link>
    </li>
  );
};

export default BackupSidebarItem;
