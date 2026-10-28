import React from "react";
import { AuthProvider } from "@/context/AuthContext";
import { MaintenanceGate } from "@/components/maintenance/MaintenanceGate";
import { PermissionProvider } from "@/context/PermissionContext";
import { CalendarWorkspaceProvider } from "@/context/CalendarWorkspaceContext";
import { Toaster } from "sonner";
import { PluginProvider } from "@/context/PluginContext";
import { PluginWidgetProvider } from "@/context/PluginWidgetContext";
import { AppRoutes } from "@/components/routing/AppRoutes";
import { OfflineIndicator } from "@/components/offline/OfflineIndicator";
import { ServiceWorkerUpdateNotice } from "@/components/offline/ServiceWorkerUpdateNotice";
import { InstallAppNotice } from "@/components/offline/InstallAppNotice";

function App() {
  return (
    <AuthProvider>
      <MaintenanceGate>
        <PermissionProvider>
          <PluginProvider>
            <PluginWidgetProvider>
              <CalendarWorkspaceProvider>
                <div className="bg-background min-h-screen">
                  <Toaster position="top-right" richColors closeButton />
                  <AppRoutes />
                  <OfflineIndicator />
                  <ServiceWorkerUpdateNotice />
                  <InstallAppNotice />
                </div>
              </CalendarWorkspaceProvider>
            </PluginWidgetProvider>
          </PluginProvider>
        </PermissionProvider>
      </MaintenanceGate>
    </AuthProvider>
  );
}

export default App;
