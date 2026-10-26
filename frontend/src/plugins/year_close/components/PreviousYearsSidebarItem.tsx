import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FolderArchive } from "lucide-react";
import { usePermissions } from "@/context/PermissionContext";

/** Admin nav entry for the Previous Years page. Superuser-only, like the page. */
const PreviousYearsSidebarItem: React.FC = () => {
  const location = useLocation();
  const { isSuperuser } = usePermissions();
  const isActive = location.pathname.startsWith("/admin/previous-years");

  if (!isSuperuser) return null;

  return (
    <li>
      <Link
        to="/admin/previous-years"
        role="menuitem"
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <FolderArchive className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
        <span>Previous Years</span>
      </Link>
    </li>
  );
};

export default PreviousYearsSidebarItem;
