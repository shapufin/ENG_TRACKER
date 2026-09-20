import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";

/**
 * HR's narrow TL-assignment page: list existing users, filter by Tech only,
 * assign/remove which italian_tl/albanian_tl they report to. Deliberately
 * does not expose the role/team filters or any other field useUserManagement
 * offers — HR gets exactly this one capability here.
 */
export const useHRTeamLeaderAssignment = () => {
  const qc = useQueryClient();
  const [techIds, setTechIds] = useState<number[]>([]);
  const [techLevelIds, setTechLevelIds] = useState<number[]>([]);
  const [noTechOnly, setNoTechOnly] = useState(false);

  const techParam = !noTechOnly && techIds.length > 0 ? techIds.join(",") : undefined;
  const techLevelParam =
    !noTechOnly && techLevelIds.length > 0 ? techLevelIds.join(",") : undefined;

  const {
    data: profiles,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["hr", "team-leader-assignment", "profiles", { techIds, techLevelIds, noTechOnly }],
    queryFn: () =>
      userService.getProfiles({
        tech: techParam,
        tech_level: techLevelParam,
        no_tech: noTechOnly || undefined,
      }),
    refetchOnMount: true,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const { data: techFacets } = useQuery({
    queryKey: ["hr", "team-leader-assignment", "tech-facets"],
    queryFn: () => userService.getTechFacets(),
    refetchOnMount: true,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const { data: italianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "italian"],
    queryFn: () => userService.getItalianTeamLeaders(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: albanianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "albanian"],
    queryFn: () => userService.getAlbanianTeamLeaders(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const setTeamLeaderMutation = useMutation({
    mutationFn: ({
      profileId,
      role,
      teamLeaderUserId,
    }: {
      profileId: number;
      role: "italian_tl" | "albanian_tl";
      teamLeaderUserId: number | null;
    }) => userService.setTeamLeader(profileId, role, teamLeaderUserId),
    onSuccess: () => {
      toast.success("Team leader updated");
      qc.invalidateQueries({ queryKey: ["hr", "team-leader-assignment"] });
    },
    onError: (err) => handleApiError(err),
  });

  const setNoTechOnlyFiltered = (value: boolean) => {
    if (value) {
      setTechIds([]);
      setTechLevelIds([]);
    }
    setNoTechOnly(value);
  };

  const setTechIdsFiltered = (ids: number[]) => {
    setNoTechOnly(false);
    setTechIds(ids);
  };

  return {
    profiles: profiles?.results ?? [],
    isLoading,
    isError,
    error,
    techFacets: techFacets?.techs ?? [],
    noTechCount: techFacets?.no_tech_count ?? 0,
    techIds,
    techLevelIds,
    noTechOnly,
    setTechIds: setTechIdsFiltered,
    setTechLevelIds,
    setNoTechOnly: setNoTechOnlyFiltered,
    italianTLs: italianTLs ?? [],
    albanianTLs: albanianTLs ?? [],
    setTeamLeader: setTeamLeaderMutation.mutate,
    isSaving: setTeamLeaderMutation.isPending,
  };
};
