import React from "react";
import type { PluginRecord } from "@/services/pluginService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PluginConfigSettings } from "./PluginConfigSettings";
import { PluginConfigPermissions } from "./PluginConfigPermissions";
import { usePluginConfigDialog } from "./hooks/usePluginConfigDialog";

interface PluginConfigDialogProps {
  plugin: PluginRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigSaved: () => void;
}

export const PluginConfigDialog: React.FC<PluginConfigDialogProps> = ({
  plugin,
  open,
  onOpenChange,
  onConfigSaved,
}) => {
  const {
    details,
    config,
    isLoading,
    isSaving,
    permissions,
    roles,
    groups,
    isSuperuser,
    permissionActions,
    isPermissionsLoading,
    isPermissionUpdating,
    handleConfigChange,
    handlePermissionUpdate,
    handleSave,
  } = usePluginConfigDialog(plugin, open, onConfigSaved, onOpenChange);

  if (!plugin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{plugin.verbose_name} Configuration</DialogTitle>
          <DialogDescription>
            Configure settings for {plugin.verbose_name} v{plugin.version}
          </DialogDescription>
        </DialogHeader>

        {isLoading || isPermissionsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-4 pr-1">
            <Tabs defaultValue="config" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="config">Settings</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
              </TabsList>

              <TabsContent value="config">
                <PluginConfigSettings
                  details={details}
                  config={config}
                  onConfigChange={handleConfigChange}
                />
              </TabsContent>

              <TabsContent value="permissions">
                <PluginConfigPermissions
                  permissions={permissions}
                  roles={roles}
                  groups={groups}
                  isSuperuser={isSuperuser}
                  permissionActions={permissionActions}
                  details={details}
                  onPermissionUpdate={handlePermissionUpdate}
                  isPermissionUpdating={isPermissionUpdating}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
