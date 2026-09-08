import React from "react";
import { AuthProvider } from "@/context/AuthContext";
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
      <PermissionProvider>
        <PluginProvider>
          <PluginWidgetProvider>
            <CalendarWorkspaceProvider>
              <div className="min-h-screen bg-background">
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
    </AuthProvider>
  );
}

export default App;
