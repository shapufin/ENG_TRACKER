/**
 * Core-owned entry point for the onboarding plugin's per-client export and purge panel.
 *
 * The archived-data dialog mounts THIS, never the plugin's component directly: a
 * static import of plugin code from core would break the build when the plugin is
 * removed (`remove_plugin` matches frontend files by filename only). Resolving
 * through the plugin registry means a removed or disabled plugin renders nothing.
 * Same indirection, and same accepted import cycle, as `PluginImportButton`.
 */
import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";
import type { Client } from "@/types";

export interface PluginClientOnboardingProps {
  client: Client;
}

export const PluginClientOnboarding: React.FC<PluginClientOnboardingProps> = (props) => {
  const { activePlugins } = usePlugins();

  if (!activePlugins.some((plugin) => plugin.name === "onboarding")) return null;

  const Panel = getPluginComponent(
    "onboarding",
    "ClientOnboardingLifecycle"
  ) as React.ComponentType<PluginClientOnboardingProps> | null;

  if (!Panel) return null;

  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
};
