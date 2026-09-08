import { createContext, useContext } from "react";

/** Provides the sidebar's collapsed state to plugin-injected sidebar
 * items (rendered via `PluginSlot`, which cannot pass props directly).
 * Standard nav items receive `collapsed` as a prop through `SidebarNav`;
 * plugin items consume it via `useSidebarCollapsed()`. */
export const SidebarCollapsedContext = createContext<boolean>(false);

export const useSidebarCollapsed = () => useContext(SidebarCollapsedContext);
