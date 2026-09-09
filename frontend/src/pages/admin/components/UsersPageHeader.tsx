import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PluginImportButton } from "@/components/admin/PluginImportButton";

interface UsersPageHeaderProps {
  onCreate: () => void;
}

export const UsersPageHeader: React.FC<UsersPageHeaderProps> = ({ onCreate }) => (
  <div className="flex flex-wrap gap-2">
    <PluginImportButton
      targetKey="users"
      label="Import Users"
      invalidateKeys={[["admin", "users"]]}
    />
    <Button size="sm" onClick={onCreate}>
      <Plus className="mr-1 h-4 w-4" /> Create User
    </Button>
  </div>
);
