/**
 * CRUsersFilterButton — toggle chip for filtering to Control Room users.
 *
 * Extracted from UsersPageContent.tsx where the same 24-line button was
 * duplicated in both the CR-only-admin and full-admin branches.
 */
import React from "react";
import { Shield } from "lucide-react";
import { Chip } from "@/components/ui/Chip";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export const CRUsersFilterButton: React.FC<Props> = ({ active, onToggle }) => (
  <Chip pressed={active} onClick={onToggle} title="Filter to Control Room users only">
    <Shield className="h-3.5 w-3.5" aria-hidden="true" />
    CR Users
  </Chip>
);
