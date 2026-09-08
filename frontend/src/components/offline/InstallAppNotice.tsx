import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallAppNotice() {
  const { isIOS, isInstallable, canShowInstallGuidance, promptInstall, dismiss } =
    useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  if (!canShowInstallGuidance) return null;

  return (
    <aside
      className="fixed inset-x-0 top-0 z-50 border-b border-primary/30 bg-primary/10 px-4 pb-3 pt-[env(safe-area-inset-top)] backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl items-start gap-3 pt-3 text-sm">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Install Engineering Tracker</p>
          {isIOS ? (
            <>
              <p className="mt-1 text-muted-foreground">
                Add the app to your Home Screen for a standalone experience and supported push
                notifications.
              </p>
              {showInstructions && (
                <p className="mt-2 text-muted-foreground">
                  Tap <Share className="mx-1 inline h-3.5 w-3.5" aria-hidden="true" /> Share, choose
                  <strong className="mx-1 text-foreground">Add to Home Screen</strong>, then open
                  Engineering Tracker from your Home Screen.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">
              Open the tracker faster from your device Home Screen.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isIOS ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-10"
                onClick={() => setShowInstructions((current) => !current)}
              >
                {showInstructions ? "Hide instructions" : "How to install"}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="min-h-10"
                onClick={() => void promptInstall()}
              >
                Install app
              </Button>
            )}
            {!isInstallable && !isIOS && (
              <span className="text-xs text-muted-foreground">
                Use your browser’s install icon when it appears.
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
