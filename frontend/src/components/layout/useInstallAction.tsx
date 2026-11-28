import { useState } from "react";
import type React from "react";
import { Download, Share, Info } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/** Install flow shared by the button and the profile-menu item. `dialog` must be
 * rendered outside any menu content, which unmounts when the menu closes. */
export function useInstallAction(returnFocusRef?: React.RefObject<HTMLElement | null>) {
  const { isIOS, isFirefox, isInstallable, canShowInstallButton, promptInstall } =
    useInstallPrompt();
  const [showDialog, setShowDialog] = useState(false);

  const install = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      setShowDialog(true);
    }
  };

  const dialog = (
    <>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent
          size="sm"
          onCloseAutoFocus={(e) => {
            // The dialog has no trigger of its own (it opens from a closed menu).
            if (!returnFocusRef?.current) return;
            e.preventDefault();
            returnFocusRef.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Install Engineering Tracker
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription asChild>
              <div className="text-muted-foreground space-y-3 text-sm">
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
                        In Firefox, try the application menu →{" "}
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
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );

  return { canShow: canShowInstallButton, install, dialog };
}
