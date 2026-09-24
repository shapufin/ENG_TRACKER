import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";

interface PluginSlotProps {
  slot: string;
  /** Restrict to items declaring this nav section, or (when omitted) only
   * items with no declared section — so a section-scoped consumer and the
   * generic fallback bucket never double-render the same item. */
  section?: string;
  fallback?: React.ReactNode;
}

export const PluginSlot: React.FC<PluginSlotProps> = ({ slot, section, fallback = null }) => {
  const { getInjectedComponents } = usePlugins();
  const injected = getInjectedComponents(slot).filter((item) =>
    section ? item.section === section : !item.section
  );

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
