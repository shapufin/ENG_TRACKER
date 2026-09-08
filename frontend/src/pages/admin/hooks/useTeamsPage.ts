import { useTeamsPageData } from "./useTeamsPageData";
import { useTeamsPageForm } from "./useTeamsPageForm";
import { useTeamsPageUI } from "./useTeamsPageUI";

export const useTeamsPage = () => {
  const { data, isLoading, groupsData, profiles } = useTeamsPageData();
  const form = useTeamsPageForm();
  const ui = useTeamsPageUI(data?.results || []);

  return {
    data,
    isLoading,
    groupsData,
    profiles,
    ...form,
    ...ui,
  };
};
