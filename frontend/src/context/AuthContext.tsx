import React, { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isMfaChallenge, type AuthResponse, type User, type LoginCredentials } from "@/types";
import { authService } from "@/services/authService";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAuthRejection, setAccessToken } from "@/lib/api";
import { getQueueCount } from "@/lib/offline/offlineQueue";
import { AuthContext, type AuthContextType } from "./auth-context-base";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const [pendingLogout, setPendingLogout] = useState<{ unsent: number; after?: () => void } | null>(
    null
  );

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
          } catch (error) {
            // Keep the last authenticated identity unless the server refused the
            // session (401/403): offline, behind a captive portal, a 5xx or a
            // closed platform (maintenance) must not destroy the session or the
            // offline queue; the session resumes when the server answers again.
            if (!isAuthRejection(error)) {
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

  // A manual log out discards the offline queue (it belongs to this person's session), so ask
  // first when something has not been sent. Session expiry never asks: it keeps the queue (H1).
  const requestLogout = useCallback(
    (after?: () => void) => {
      const unsent = getQueueCount();
      if (unsent === 0) {
        logout();
        after?.();
        return;
      }
      setPendingLogout({ unsent, after });
    },
    [logout]
  );

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
    requestLogout,
    refreshUser,
    isAuthenticated: !!user,
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pendingLogout !== null}
        onOpenChange={(open) => !open && setPendingLogout(null)}
        title="You have unsent changes"
        description={`${pendingLogout?.unsent ?? 0} unsent ${pendingLogout?.unsent === 1 ? "change" : "changes"} made while offline will be lost if you log out now. Stay signed in and reconnect to send them.`}
        confirmLabel="Log out anyway"
        variant="destructive"
        onConfirm={() => {
          const after = pendingLogout?.after;
          setPendingLogout(null);
          logout();
          after?.();
        }}
      />
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { useAuth } from "@/hooks/useAuth";
