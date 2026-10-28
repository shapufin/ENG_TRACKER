import api from "@/lib/api";
import type { MaintenanceStatus } from "@/types";

/** Payload for PATCH /dashboard/maintenance/ (staff only). */
export interface MaintenanceUpdate {
  is_active?: boolean;
  title?: string;
  message?: string;
  ends_at?: string | null;
}

export const maintenanceService = {
  /** Public: the only call that keeps working while maintenance is on. */
  async getStatus(): Promise<MaintenanceStatus> {
    const { data } = await api.get<MaintenanceStatus>("/dashboard/maintenance/", {
      timeout: 4000,
    });
    return data;
  },

  async update(payload: MaintenanceUpdate): Promise<MaintenanceStatus> {
    const { data } = await api.patch<MaintenanceStatus>("/dashboard/maintenance/", payload);
    return data;
  },
};
