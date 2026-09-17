/**
 * Core-owned entry point for the control_room plugin's CRScopeCard.
 *
 * SettingsPage mounts THIS, never the plugin's component directly — see
 * PluginImportButton for the pattern this follows.
 */
import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";

export const PluginCRScopeCard: React.FC = () => {
  const { activePlugins } = usePlugins();

  if (!activePlugins.some((plugin) => plugin.name === "control_room")) return null;

  const CRScopeCard = getPluginComponent(
    "control_room",
    "CRScopeCard"
  ) as React.ComponentType | null;

  if (!CRScopeCard) return null;

  return (
    <Suspense fallback={null}>
      <CRScopeCard />
    </Suspense>
  );
};
