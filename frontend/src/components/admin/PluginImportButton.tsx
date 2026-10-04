// fallow-ignore-file circular-dependencies
/**
 * Core-owned entry point for the data_import plugin's per-page button.
 *
 * Admin pages mount THIS, never the plugin's component directly: a static
 * import of plugin code from core would make `remove_plugin data_import`
 * break the build (its cross-reference sweep is Python-only and matches
 * frontend files by filename). Resolving through the plugin registry means a
 * removed or disabled plugin simply renders nothing.
 *
 * The cycle this file takes part in (plugins/index.ts -> plugin page ->
 * this button -> plugins/index.ts) is the same registry indirection that
 * keeps `remove_plugin` from breaking the build: core never statically
 * imports plugin code, it resolves through `getPluginComponent`. Breaking
 * the cycle would mean reintroducing the static import it exists to avoid.
 */
import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";

export interface PluginImportButtonProps {
  /** The import target this page owns, e.g. "clients". */
  targetKey: string;
  /** Button label. Defaults to "Import". */
  label?: string;
  /** Query keys to invalidate after a successful commit. */
  invalidateKeys?: readonly unknown[][];
}

export const PluginImportButton: React.FC<PluginImportButtonProps> = (props) => {
  const { activePlugins } = usePlugins();

  // Checked before resolving, so a disabled plugin costs nothing — not even
  // the registry lookup or the button's own targets request.
  if (!activePlugins.some((plugin) => plugin.name === "data_import")) return null;

  const ImportPageButton = getPluginComponent(
    "data_import",
    "ImportPageButton"
  ) as React.ComponentType<PluginImportButtonProps> | null;

  if (!ImportPageButton) return null;

  return (
    <Suspense fallback={null}>
      <ImportPageButton {...props} />
    </Suspense>
  );
};
