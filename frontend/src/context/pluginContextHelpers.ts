import type { PluginMetadata } from "@/services/pluginService";

interface FetchActivePluginsOptions {
  isAuthenticated: boolean;
  user: { id: number } | null;
  authLoading: boolean;
  getActiveMetadata: () => Promise<PluginMetadata[]>;
}

export const fetchActivePlugins = async ({
  isAuthenticated,
  user,
  authLoading,
  getActiveMetadata,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: FetchActivePluginsOptions): Promise<{ plugins: PluginMetadata[] | null; error?: any }> => {
  if (!isAuthenticated || !user || authLoading) {
    return { plugins: [] };
  }
  try {
    const plugins = await getActiveMetadata();
    return { plugins };
  } catch (error) {
    return { plugins: [], error };
  }
};
