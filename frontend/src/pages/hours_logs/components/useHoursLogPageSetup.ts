import { useHoursLogPageState } from "./useHoursLogPageState";
import { useHoursLogQueryCallbacks } from "./useHoursLogQueryCallbacks";

interface UseHoursLogPageSetupOptions {
  setFormOpen: (v: boolean) => void;
  resetForm: () => void;
}

export const useHoursLogPageSetup = ({ setFormOpen, resetForm }: UseHoursLogPageSetupOptions) => {
  const state = useHoursLogPageState();
  const queryCallbacks = useHoursLogQueryCallbacks({ ...state, setFormOpen, resetForm });
  return { ...state, queryCallbacks };
};
