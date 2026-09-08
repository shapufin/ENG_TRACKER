import { createContext } from "react";
import type { User, LoginCredentials, AuthResponse } from "@/types";

export interface AuthContextType {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  logout: () => void;
  /** Re-fetch the current user from `/users/me/` and update context state. */
  refreshUser: () => Promise<User | null>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
