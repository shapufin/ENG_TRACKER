import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "engtracker:pwa-install-dismissed:v1";

type InstallOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

export interface InstallPromptState {
  isIOS: boolean;
  isFirefox: boolean;
  isStandalone: boolean;
  isInstallable: boolean;
  canShowInstallGuidance: boolean;
  /** True when the sidebar install button should be visible. Unlike
   *  canShowInstallGuidance (which drives the top banner), this is also
   *  true on Firefox where beforeinstallprompt never fires — the button
   *  shows generic guidance instead. */
  canShowInstallButton: boolean;
  promptInstall: () => Promise<boolean>;
  dismiss: () => void;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectFirefox(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Firefox/i.test(navigator.userAgent);
}

function detectStandalone(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function readDismissed(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1";
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS] = useState(detectIOS);
  const [isFirefox] = useState(detectFirefox);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "dismissed") {
      localStorage.setItem(DISMISSED_KEY, "1");
      setDismissed(true);
    }
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    isIOS,
    isFirefox,
    isStandalone,
    isInstallable: !isStandalone && !dismissed && Boolean(deferredPrompt),
    canShowInstallGuidance: !isStandalone && !dismissed && (isIOS || Boolean(deferredPrompt)),
    // The sidebar button is a persistent entry point — it shows on any
    // browser when not in standalone mode, regardless of whether the top
    // banner was dismissed. The button adapts its behavior per browser:
    // Chrome/Edge triggers the native prompt or shows address-bar guidance,
    // iOS shows Share instructions, Firefox shows alternative guidance.
    canShowInstallButton: !isStandalone,
    promptInstall,
    dismiss,
  };
}
