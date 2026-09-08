import api from "@/lib/api";
import type { LoginCredentials, AuthResponse, User } from "@/types";
import { clearOfflineUserData } from "@/lib/offline/offlineQueue";

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/token/", credentials);
    return data;
  },

  async refreshToken(_legacyRefresh?: string): Promise<{ access: string }> {
    void _legacyRefresh;
    const { data } = await api.post<{ access: string }>("/auth/token/refresh/", {});
    return data;
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
