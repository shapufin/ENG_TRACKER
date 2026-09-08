import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/context/AuthContext";
import { LoadingCard } from "@/components/ui/LoadingCard";

export const SuperuserRoute: React.FC = () => {
  const { isSuperuser, isAdmin, isHR, isCRAdmin, isTeamLeader } = usePermissions();
  const { isLoading } = useAuth();
  if (isLoading) return <LoadingCard />;

  const isCROnlyAdmin = isCRAdmin && !isAdmin && !isSuperuser && !isHR && !isTeamLeader;
  if (isCROnlyAdmin) {
    return <Navigate to="/control-room/dashboard" replace />;
  }

  return isSuperuser || isAdmin || isHR ? <Outlet /> : <Navigate to="/dashboard" replace />;
};
