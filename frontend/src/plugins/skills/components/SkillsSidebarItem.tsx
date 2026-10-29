/** Sidebar item for the Skills plugin (app layout).
 *
 * Groups My Skills, Team Skills, and Skill History under a single
 * collapsible "Skills" parent to reduce sidebar vertical space. */
import React from "react";
import { Award } from "lucide-react";
import { SidebarNavGroup, type SidebarNavGroupItem } from "@/components/layout/SidebarNavGroup";
import { usePermissions } from "@/context/PermissionContext";

const SkillsSidebarItem: React.FC = () => {
  const { isCRUser, isCRAdmin, isAdmin, isSuperuser, isHR, isHROnly, isTeamLeader } =
    usePermissions();
  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  const isCRScoped = isCRUser || isCROnlyAdmin;

  // CR-only users don't see the skills sidebar item.
  if (isCRScoped) return null;

  // Pure HR has no skills of their own to rate: they see Team Skills only.
  const items: SidebarNavGroupItem[] = isHROnly
    ? []
    : [{ to: "/skills", label: "My Skills", icon: Award }];

  if (isTeamLeader || isHR || isAdmin || isSuperuser) {
    items.push({ to: "/skills/team", label: "Team Skills", icon: Award });
  }

  if (!isHROnly) items.push({ to: "/skills/history", label: "Skill History", icon: Award });

  return <SidebarNavGroup label="Skills" icon={Award} items={items} />;
};

export default SkillsSidebarItem;
