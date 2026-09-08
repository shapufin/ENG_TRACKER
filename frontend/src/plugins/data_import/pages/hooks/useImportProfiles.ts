import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataImportService } from "../../services/dataImportService";
import type { ImportProfile } from "../../types/dataImport";

export function useImportProfiles(targetKey: string | null) {
  const qc = useQueryClient();
  const queryKey = ["data_import", "profiles", targetKey ?? "all"];

  const { data: profiles = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => (targetKey ? dataImportService.listProfiles(targetKey) : []),
    enabled: !!targetKey,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<ImportProfile, "id" | "created_at" | "updated_at">) =>
      dataImportService.createProfile(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_import", "profiles"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ImportProfile> }) =>
      dataImportService.updateProfile(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_import", "profiles"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => dataImportService.deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["data_import", "profiles"] }),
  });

  return {
    profiles,
    isLoading,
    createProfile: createMutation.mutate,
    updateProfile: updateMutation.mutate,
    deleteProfile: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
