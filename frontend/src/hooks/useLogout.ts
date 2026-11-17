import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export const useLogout = () => {
  const { requestLogout } = useAuth();
  const navigate = useNavigate();
  return () => requestLogout(() => navigate("/login"));
};
