import { useState, useEffect } from "react";
import type { DashboardType } from "@/context/permission-context-base";

export const useDashboardSelection = (
  primaryDashboard: DashboardType,
  availableDashboards: DashboardType[]
) => {
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardType>(primaryDashboard);

  useEffect(() => {
    const savedDashboard = localStorage.getItem("selectedDashboard");
    const validSavedDashboard =
      savedDashboard && availableDashboards.includes(savedDashboard as DashboardType)
        ? (savedDashboard as DashboardType)
        : null;

    if (validSavedDashboard && validSavedDashboard !== selectedDashboard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDashboard(validSavedDashboard);
    } else if (!validSavedDashboard && selectedDashboard !== primaryDashboard) {
      setSelectedDashboard(primaryDashboard);
    }
  }, [availableDashboards, primaryDashboard, selectedDashboard]);

  const handleDashboardChange = (dashboard: DashboardType) => {
    setSelectedDashboard(dashboard);
    try {
      localStorage.setItem("selectedDashboard", dashboard);
    } catch (error) {
      console.warn("Failed to save dashboard preference:", error);
    }
  };

  return { selectedDashboard, handleDashboardChange };
};
