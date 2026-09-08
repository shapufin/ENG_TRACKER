import { useState, useEffect, useCallback } from "react";
import { pluginService, type PluginRecord } from "@/services/pluginService";
import { toast } from "sonner";
import { usePlugins } from "@/context/PluginContext";

const ADMIN_ROUTE_MAP: Record<string, string> = {
  analytics: "/admin/analytics",
  audit_log: "/admin/audit-logs",
  organigrama: "/admin/organigrama",
  payroll: "/admin/payroll/runs",
  skills: "/admin/skills/catalog",
};

export interface UsePluginManagementReturn {
  plugins: PluginRecord[];
  isLoading: boolean;
  isDiscovering: boolean;
  initializingId: number | null;
  selectedPlugin: PluginRecord | null;
  configDialogOpen: boolean;
  setSelectedPlugin: (plugin: PluginRecord | null) => void;
  setConfigDialogOpen: (open: boolean) => void;
  fetchPlugins: () => Promise<void>;
  handleToggle: (id: number) => Promise<void>;
  handleInitialize: (id: number) => Promise<void>;
  handleDiscover: () => Promise<void>;
  handlePluginLink: (plugin: PluginRecord) => void;
}

export const usePluginManagement = (): UsePluginManagementReturn => {
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [initializingId, setInitializingId] = useState<number | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginRecord | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const { refreshActivePlugins } = usePlugins();

  const fetchPlugins = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await pluginService.getPlugins();
      setPlugins(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to fetch plugins");
      setPlugins([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleToggle = useCallback(
    async (id: number) => {
      try {
        const result = await pluginService.togglePlugin(id);
        setPlugins((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_enabled: result.is_enabled } : p))
        );
        toast.success(`Plugin ${result.is_enabled ? "enabled" : "disabled"}`);
        await refreshActivePlugins();
      } catch {
        toast.error("Failed to toggle plugin");
      }
    },
    [refreshActivePlugins]
  );

  const handleInitialize = useCallback(
    async (id: number) => {
      setInitializingId(id);
      try {
        const result = await pluginService.initializePlugin(id);
        toast.success(`✓ ${result.message || "Plugin initialized successfully"}`);
        await fetchPlugins();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const errorMessage = error?.message || "Failed to initialize plugin tables";
        toast.error(`❌ ${errorMessage}`);
        console.error("Initialize error:", error);
      } finally {
        setInitializingId(null);
      }
    },
    [fetchPlugins]
  );

  const handlePluginLink = useCallback((plugin: PluginRecord) => {
    const path = ADMIN_ROUTE_MAP[plugin.name];
    if (path) {
      window.location.href = path;
    } else {
      toast.error("No admin page found for this plugin");
    }
  }, []);

  const handleDiscover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const data = await pluginService.discoverPlugins();
      setPlugins(Array.isArray(data) ? data : []);
      toast.success("Plugin discovery complete");
    } catch {
      toast.error("Failed to discover plugins");
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlugins();
  }, [fetchPlugins]);

  return {
    plugins,
    isLoading,
    isDiscovering,
    initializingId,
    selectedPlugin,
    configDialogOpen,
    setSelectedPlugin,
    setConfigDialogOpen,
    fetchPlugins,
    handleToggle,
    handleInitialize,
    handleDiscover,
    handlePluginLink,
  };
};
