import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallAction } from "./useInstallAction";

interface SidebarInstallButtonProps {
  collapsed: boolean;
}

/**
 * Persistent install entry point in the sidebar footer.
 *
 * - Chrome/Edge: triggers the native beforeinstallprompt.
 * - iOS Safari: shows "Share → Add to Home Screen" instructions.
 * - Firefox/other: shows guidance to use Chrome/Edge or the browser's
 *   own "Install site as app" menu option if available.
 * - Hidden entirely when already in standalone mode (app is installed).
 */
export function SidebarInstallButton({ collapsed }: SidebarInstallButtonProps) {
  const { canShow, install, dialog } = useInstallAction();

  if (!canShow) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`gap-2 ${collapsed ? "w-10 justify-center p-0" : "w-full"}`}
        onClick={install}
        aria-label="Install app"
      >
        <Download className="h-4 w-4 shrink-0" />
        {!collapsed && "Install app"}
      </Button>
      {dialog}
    </>
  );
}
