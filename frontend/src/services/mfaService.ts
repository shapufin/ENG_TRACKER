import api from "@/lib/api";
import type { MfaSetupData, MfaStatus } from "@/types";

type ApiError = { response?: { data?: { detail?: string; error?: string } } };

/** The server's own wording for a failed second-factor step ("That code is not right…"). */
export const mfaErrorMessage = (error: unknown, fallback = "Something went wrong. Try again."): string => {
  const data = (error as ApiError)?.response?.data;
  return data?.detail || data?.error || fallback;
};

export const mfaService = {
  async status(): Promise<MfaStatus> {
    const { data } = await api.get<MfaStatus>("/auth/mfa/status/");
    return data;
  },

  async setup(password: string): Promise<MfaSetupData> {
    const { data } = await api.post<MfaSetupData>("/auth/mfa/setup/", { password });
    return data;
  },

  async activate(code: string): Promise<{ backup_codes: string[] }> {
    const { data } = await api.post<{ backup_codes: string[] }>("/auth/mfa/activate/", { code });
    return data;
  },

  async disable(password: string, code: string): Promise<void> {
    await api.post("/auth/mfa/disable/", { password, code });
  },

  async regenerateBackupCodes(password: string, code: string): Promise<{ backup_codes: string[] }> {
    const { data } = await api.post<{ backup_codes: string[] }>("/auth/mfa/backup-codes/", {
      password,
      code,
    });
    return data;
  },

  /** Admin: second-factor state of one account. */
  async adminStatus(userId: number): Promise<MfaStatus> {
    const { data } = await api.get<MfaStatus>(`/users/users/${userId}/mfa_status/`);
    return data;
  },

  /** Admin: remove a user's second factor (lost phone and backup codes). */
  async adminReset(userId: number): Promise<void> {
    await api.post(`/users/users/${userId}/reset_mfa/`);
  },
};
