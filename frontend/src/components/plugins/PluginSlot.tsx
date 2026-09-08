import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";

interface PluginSlotProps {
  slot: string;
  fallback?: React.ReactNode;
}

export const PluginSlot: React.FC<PluginSlotProps> = ({ slot, fallback = null }) => {
  const { getInjectedComponents } = usePlugins();
  const injected = getInjectedComponents(slot);

  if (injected.length === 0) {
    return null;
  }

  return (
    <>
      {injected.map(({ pluginName, componentName }) => {
        const Component = getPluginComponent(pluginName, componentName);
        if (!Component) {
          console.warn(`Plugin component not found: ${pluginName}.${componentName}`);
          return null;
        }

        return (
          <Suspense key={`${pluginName}-${componentName}`} fallback={fallback}>
            <Component />
          </Suspense>
        );
      })}
    </>
  );
};
