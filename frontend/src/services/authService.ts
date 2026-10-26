import api, { setAccessToken, withRefreshLock } from "@/lib/api";
import type { LoginCredentials, AuthResponse, LoginResponse, MfaSetupData, User } from "@/types";
import { clearOfflineUserData } from "@/lib/offline/offlineQueue";

export const authService = {
  /** Tokens, or a second-factor challenge when the account needs one. */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>("/auth/token/", credentials);
    return data;
  },

  async verifyMfa(mfaToken: string, code: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/token/mfa-verify/", {
      mfa_token: mfaToken,
      code,
    });
    return data;
  },

  /** Seed + QR for an account that must enrol before it can sign in. */
  async startLoginSetup(mfaToken: string): Promise<MfaSetupData> {
    const { data } = await api.post<MfaSetupData>("/auth/mfa/login/setup/", { mfa_token: mfaToken });
    return data;
  },

  async finishLoginSetup(mfaToken: string, code: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/mfa/login/activate/", {
      mfa_token: mfaToken,
      code,
    });
    return data;
  },

  async refreshToken(_legacyRefresh?: string): Promise<{ access: string }> {
    void _legacyRefresh;
    const { data } = await withRefreshLock(() =>
      api.post<{ access: string }>("/auth/token/refresh/", {})
    );
    return data;
  },

  /** Changes the password. The server revokes every refresh token and hands this session a new one. */
  async changePassword(currentPassword: string, newPassword: string, code?: string): Promise<void> {
    const { data } = await api.post<AuthResponse>("/auth/password/change/", {
      current_password: currentPassword,
      new_password: newPassword,
      ...(code ? { code } : {}),
    });
    setAccessToken(data.access);
  },

  async getCurrentUser(): Promise<User> {
    const { data } = await api.get<User>("/users/users/me/");
    return data;
  },

  logout() {
    void api.post("/auth/token/logout/").catch(() => undefined);
    clearOfflineUserData();
    localStorage.removeItem("user");
  },
};
