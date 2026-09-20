import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { usePermissions } from "@/context/PermissionContext";

interface UsersPageHeaderProps {
  onCreate: () => void;
}

export const UsersPageHeader: React.FC<UsersPageHeaderProps> = ({ onCreate }) => {
  const { isHR, isAdmin, isSuperuser } = usePermissions();
  // Pure HR has no create-user permission (backend create_user is
  // IsAdminUser-gated) — don't offer an action that will 403.
  const canCreate = isAdmin || isSuperuser || !isHR;

  return (
    <div className="flex flex-wrap gap-2">
      <PluginImportButton
        targetKey="users"
        label="Import Users"
        invalidateKeys={[["admin", "users"]]}
      />
      {canCreate && (
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-4 w-4" /> Create User
        </Button>
      )}
    </div>
  );
};
