/** Sidebar item for the employee-facing "My records" page (every authenticated
 * user except an HBPR-only one — the API refuses that surface for them). */
import React from "react";
import { useLocation } from "react-router-dom";
import { FileText } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const MyRecordsSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isHBPROnly } = usePermissions();

  if (isHBPROnly) return null;

  return (
    <SidebarNavLink
      to="/my-records"
      label="My records"
      icon={FileText}
      isActive={location.pathname === "/my-records"}
    />
  );
};

export default MyRecordsSidebarLink;
