import { useState } from "react";
import { Download, Share, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

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
  const { isIOS, isFirefox, isInstallable, canShowInstallButton, promptInstall } =
    useInstallPrompt();
  const [showDialog, setShowDialog] = useState(false);

  if (!canShowInstallButton) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      setShowDialog(true);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`gap-2 ${collapsed ? "w-10 justify-center p-0" : "w-full"}`}
        onClick={handleClick}
        aria-label="Install app"
      >
        <Download className="h-4 w-4 shrink-0" />
        {!collapsed && "Install app"}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Install Engineering Tracker
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground">
                {isIOS ? (
                  <div className="space-y-2">
                    <p>
                      Add the app to your Home Screen for a standalone experience and supported push
                      notifications.
                    </p>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>
                        Tap the{" "}
                        <Share
                          className="inline h-3.5 w-3.5 align-text-bottom"
                          aria-hidden="true"
                        />{" "}
                        Share button in Safari.
                      </li>
                      <li>
                        Choose <strong className="text-foreground">Add to Home Screen</strong>.
                      </li>
                      <li>Open Engineering Tracker from your Home Screen.</li>
                    </ol>
                  </div>
                ) : isFirefox ? (
                  <div className="space-y-2">
                    <p>Firefox has limited PWA install support. You have two options:</p>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>
                        Open this site in <strong className="text-foreground">Chrome</strong> or{" "}
                        <strong className="text-foreground">Edge</strong> and click the install icon
                        in the address bar.
                      </li>
                      <li>
                        In Firefox, try the menu (☰) →{" "}
                        <strong className="text-foreground">Install site as app</strong> (if
                        available on your platform).
                      </li>
                    </ol>
                    <p className="flex items-start gap-1.5 pt-1">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        The app works fine in Firefox as a browser tab. Installing is optional and
                        gives you a fullscreen, app-like experience.
                      </span>
                    </p>
                  </div>
                ) : (
                  <p>
                    Use your browser&apos;s install option in the address bar or menu to install
                    this app.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
