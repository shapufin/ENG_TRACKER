/** Sidebar item for the employee-facing "My records" page. Hidden for an HBPR-only
 * user (the API refuses that surface) and for an Albanian TL, who is governed
 * through their HBPR and is never the subject of these records. */
import React from "react";
import { useLocation } from "react-router-dom";
import { FileText } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { usePermissions } from "@/context/PermissionContext";

const MyRecordsSidebarLink: React.FC = () => {
  const location = useLocation();
  const { isHBPROnly, isAlbanianTL } = usePermissions();

  if (isHBPROnly || isAlbanianTL) return null;

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
