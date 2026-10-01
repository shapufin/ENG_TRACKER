/** Sidebar item for the employee-facing "My records" page (every authenticated user). */
import React from "react";
import { useLocation } from "react-router-dom";
import { FileText } from "lucide-react";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";

const MyRecordsSidebarLink: React.FC = () => {
  const location = useLocation();

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
