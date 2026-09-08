import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";

interface UsersPageHeaderProps {
  onCreate: () => void;
}

export const UsersPageHeader: React.FC<UsersPageHeaderProps> = ({ onCreate }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate("/admin/data-import?target=users")}
      >
        <Upload className="mr-1 h-4 w-4" /> Import Users
      </Button>
      <Button size="sm" onClick={onCreate}>
        <Plus className="mr-1 h-4 w-4" /> Create User
      </Button>
    </div>
  );
};
