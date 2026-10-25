import React, { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isMfaChallenge, type AuthResponse, type User, type LoginCredentials } from "@/types";
import { authService } from "@/services/authService";
import { setAccessToken } from "@/lib/api";
import { AuthContext, type AuthContextType } from "./auth-context-base";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const bootstrap = async () => {
      try {
        await Promise.resolve();

        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          try {
            const refreshed = await authService.refreshToken();
            setAccessToken(refreshed.access);
            const currentUser = await authService.getCurrentUser();
            if (!cancelled) {
              setUser(currentUser);
              localStorage.setItem("user", JSON.stringify(currentUser));
            }
          } catch {
            // Keep the last authenticated identity during an offline
            // bootstrap so user-scoped cached data can be displayed.
            if (!navigator.onLine) {
              try {
                if (!cancelled) setUser(JSON.parse(storedUser));
              } catch {
                authService.logout();
                if (!cancelled) setUser(null);
              }
            } else {
              authService.logout();
              if (!cancelled) setUser(null);
            }
          }
          return;
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const startSession = useCallback(
    (data: AuthResponse) => {
      queryClient.clear();
      setAccessToken(data.access);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data;
    },
    [queryClient]
  );

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      queryClient.clear();
      const data = await authService.login(credentials);
      // A challenge is not a session: nothing is stored until the second step passes.
      return isMfaChallenge(data) ? data : startSession(data);
    },
    [queryClient, startSession]
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) =>
      startSession(await authService.verifyMfa(mfaToken, code)),
    [startSession]
  );

  const startLoginSetup = useCallback(
    (mfaToken: string) => authService.startLoginSetup(mfaToken),
    []
  );

  const finishLoginSetup = useCallback(
    async (mfaToken: string, code: string) =>
      startSession(await authService.finishLoginSetup(mfaToken, code)),
    [startSession]
  );

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      localStorage.setItem("user", JSON.stringify(currentUser));
      return currentUser;
    } catch {
      return null;
    }
  }, []);

  const value: AuthContextType = {
    user,
    login,
    verifyMfa,
    startLoginSetup,
    finishLoginSetup,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export { useAuth } from "@/hooks/useAuth";
