import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { AuthResponse, PhoneApprovalStart } from "@/types";

/** The PC asks the server every 2 s; the request itself lives 120 s (item 90). */
export const PHONE_POLL_MS = 2000;
const GRACE_SECONDS = 5;

export type PhoneWaitEnd = "denied" | "expired";

interface Props {
  mfaToken: string;
  request: PhoneApprovalStart;
  onSignedIn: (data: AuthResponse) => void;
  onEnded: (reason: PhoneWaitEnd) => void;
  onError: (error: unknown) => void;
}

/**
 * Shows the number to tap on the phone and polls until the phone approves. Stops on unmount, on
 * denied/expired and once the request window has passed: it can never poll forever.
 */
export const PhoneApprovalWait: React.FC<Props> = ({ mfaToken, request, onSignedIn, onEnded, onError }) => {
  const { completePhoneApproval } = useAuth();
  const [showQr, setShowQr] = useState(!request.pushed);
  const handlers = useRef({ onSignedIn, onEnded, onError });
  useEffect(() => {
    handlers.current = { onSignedIn, onEnded, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + (request.expires_in + GRACE_SECONDS) * 1000;

    const poll = async () => {
      try {
        const data = await completePhoneApproval(mfaToken, request.request_id, request.collect_key);
        if (cancelled) return;
        if ("access" in data) {
          handlers.current.onSignedIn(data);
        } else if (data.status === "denied" || data.status === "expired") {
          handlers.current.onEnded(data.status);
        } else if (Date.now() >= deadline) {
          handlers.current.onEnded("expired");
        } else {
          timer = setTimeout(() => void poll(), PHONE_POLL_MS);
        }
      } catch (error) {
        if (!cancelled) handlers.current.onError(error);
      }
    };

    timer = setTimeout(() => void poll(), PHONE_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mfaToken, request, completePhoneApproval]);

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <Smartphone className="text-primary h-10 w-10" aria-hidden="true" />
      <p className="text-muted-foreground text-sm">
        {showQr
          ? request.pushed
            ? "Scan this code with your phone's camera, then tap this number:"
            : "We could not reach your phone. Scan this code with its camera, then tap this number:"
          : "Check your phone. Open the notification and tap this number:"}
      </p>
      <p
        className="text-foreground text-5xl font-bold tabular-nums"
        aria-label={`Your number is ${request.number}`}
      >
        {request.number}
      </p>
      {showQr && (
        // White tile in both themes: a QR needs dark-on-light contrast to scan.
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(request.qr_svg)}`}
          alt="QR code to approve this sign-in on your phone"
          width={176}
          height={176}
          className="h-44 w-44 rounded-lg border bg-white p-2"
        />
      )}
      <button
        type="button"
        className="text-primary hover:text-primary-hover inline-flex min-h-6 items-center text-sm underline-offset-4 hover:underline"
        onClick={() => setShowQr((value) => !value)}
      >
        {showQr ? "Hide QR code" : "Show QR code instead"}
      </button>
      <p role="status" className="text-muted-foreground text-xs">
        Waiting for your phone. Only approve if you are signing in right now.
      </p>
    </div>
  );
};
