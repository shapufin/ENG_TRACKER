import React from "react";
import { RefreshCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePluginManagement } from "@/hooks/usePluginManagement";
import { PluginManagementGrid } from "@/components/admin/PluginManagementGrid";
import { PluginConfigDialog } from "@/components/admin/PluginConfigDialog";

export const PluginManagementPage: React.FC = () => {
  const {
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
  } = usePluginManagement();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openConfig = (plugin: any) => {
    setSelectedPlugin(plugin);
    setConfigDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle pb-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Plugin Management</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Manage and extend application functionality through plugins.
          </p>
        </div>
        <Button
          onClick={handleDiscover}
          disabled={isDiscovering || isLoading}
          className="flex items-center gap-2"
        >
          {isDiscovering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Discover Plugins
        </Button>
      </div>

      <PluginManagementGrid
        plugins={plugins}
        isLoading={isLoading}
        initializingId={initializingId}
        onToggle={handleToggle}
        onInitialize={handleInitialize}
        onConfigure={openConfig}
        onLink={handlePluginLink}
      />

      <PluginConfigDialog
        plugin={selectedPlugin}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onConfigSaved={() => fetchPlugins()}
      />
    </div>
  );
};
