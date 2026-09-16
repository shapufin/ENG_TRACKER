import React from "react";
import { RefreshCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
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
    <PageShell
      title="Plugin Management"
      subtitle="Manage and extend application functionality through plugins."
      actions={
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
      }
    >
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
    </PageShell>
  );
};
