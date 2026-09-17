/**
 * Core-owned entry points for the control_room plugin's CR user
 * create/edit dialogs and bulk command drawer.
 *
 * Admin pages mount THESE, never the plugin's components directly: a
 * static import of plugin code from core would make `remove_plugin
 * control_room` break the build (its cross-reference sweep is Python-only
 * and matches frontend files by filename). Resolving through the plugin
 * registry means a removed or disabled plugin simply renders nothing.
 * Follows the same idiom as PluginImportButton.
 */
import React, { Suspense } from "react";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";
import type { Team } from "@/types";
import type { CRAccessRecord } from "@/pages/admin/hooks/useUsersPage";

const useControlRoomActive = () => {
  const { activePlugins } = usePlugins();
  return activePlugins.some((plugin) => plugin.name === "control_room");
};

export interface PluginCreateCRUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
}

export const PluginCreateCRUserDialog: React.FC<PluginCreateCRUserDialogProps> = (props) => {
  if (!useControlRoomActive()) return null;

  const CreateCRUserDialog = getPluginComponent(
    "control_room",
    "CreateCRUserDialog"
  ) as React.ComponentType<PluginCreateCRUserDialogProps> | null;

  if (!CreateCRUserDialog) return null;

  return (
    <Suspense fallback={null}>
      <CreateCRUserDialog {...props} />
    </Suspense>
  );
};

export interface PluginEditCRUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: CRAccessRecord | null;
  username: string;
  teams: Team[];
}

export const PluginEditCRUserDialog: React.FC<PluginEditCRUserDialogProps> = (props) => {
  if (!useControlRoomActive()) return null;

  const EditCRUserDialog = getPluginComponent(
    "control_room",
    "EditCRUserDialog"
  ) as React.ComponentType<PluginEditCRUserDialogProps> | null;

  if (!EditCRUserDialog) return null;

  return (
    <Suspense fallback={null}>
      <EditCRUserDialog {...props} />
    </Suspense>
  );
};

export interface PluginCRBulkCommandDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: number[];
  selectedNames: string[];
  teams: Team[];
  onClearSelection: () => void;
}

export const PluginCRBulkCommandDrawer: React.FC<PluginCRBulkCommandDrawerProps> = (props) => {
  if (!useControlRoomActive()) return null;

  const CRBulkCommandDrawer = getPluginComponent(
    "control_room",
    "CRBulkCommandDrawer"
  ) as React.ComponentType<PluginCRBulkCommandDrawerProps> | null;

  if (!CRBulkCommandDrawer) return null;

  return (
    <Suspense fallback={null}>
      <CRBulkCommandDrawer {...props} />
    </Suspense>
  );
};
