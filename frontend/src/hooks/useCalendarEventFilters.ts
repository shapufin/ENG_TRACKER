import { useState, useMemo, useCallback } from "react";

type EventType = "standby" | "vacation" | "sick";

export const useCalendarEventFilters = () => {
  const [showStandby, setShowStandby] = useState(true);
  const [showVacation, setShowVacation] = useState(true);
  const [showSick, setShowSick] = useState(true);

  const toggleEventType = useCallback((type: EventType) => {
    const toggles: Record<EventType, React.Dispatch<React.SetStateAction<boolean>>> = {
      standby: setShowStandby,
      vacation: setShowVacation,
      sick: setShowSick,
    };
    toggles[type]?.((state) => !state);
  }, []);

  const resetFilters = useCallback(() => {
    setShowStandby(true);
    setShowVacation(true);
    setShowSick(true);
  }, []);

  const hiddenFilterCount = useMemo(
    () => [showStandby, showVacation, showSick].filter((value) => !value).length,
    [showStandby, showVacation, showSick]
  );

  return {
    showStandby,
    setShowStandby,
    showVacation,
    setShowVacation,
    showSick,
    setShowSick,
    toggleEventType,
    resetFilters,
    hiddenFilterCount,
  };
};
