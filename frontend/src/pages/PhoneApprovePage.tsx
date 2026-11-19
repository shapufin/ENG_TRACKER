import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { mfaErrorMessage } from "@/services/mfaService";
import { PasskeyCancelledError, getAssertion, isPasskeySupported } from "@/services/passkeyService";
import { decideApproval, getApprovalRequest } from "@/services/phoneApprovalService";
import type { PhoneApprovalView } from "@/types";

type Phase = "loading" | "ready" | "busy" | "approved" | "denied" | "failed";

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Opened from the push notification or the QR code on the sign-in screen. Public route: the
 * phone needs no session, the paired passkey's biometric prompt is the authentication.
 */
export const PhoneApprovePage: React.FC = () => {
  const { requestId = "" } = useParams<{ requestId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<PhoneApprovalView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    getApprovalRequest(requestId)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          mfaErrorMessage(err, "This request could not be opened. Start again on your computer.")
        );
        setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const approve = async (number: number) => {
    if (!view) return;
    setPhase("busy");
    setNotice("");
    try {
      const response = await getAssertion(view.assertion);
      await decideApproval(requestId, { decision: "approve", number, response });
      setPhase("approved");
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        setNotice("Cancelled. Tap a number to try again.");
        setPhase("ready");
        return;
      }
      setError(mfaErrorMessage(err, "The approval did not work. Start again on your computer."));
      setPhase("failed");
    }
  };

  const deny = async () => {
    setPhase("busy");
    try {
      await decideApproval(requestId, { decision: "deny" });
      setPhase("denied");
    } catch (err) {
      setError(
        mfaErrorMessage(
          err,
          "The request could not be cancelled. It expires by itself in a few minutes."
        )
      );
      setPhase("failed");
    }
  };

  const supported = isPasskeySupported();
  const busy = phase === "busy";

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      <GlassCard delay={0} className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="bg-primary/10 mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full">
            <ShieldCheck className="text-primary h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold">Approve this sign-in?</h1>
        </div>

        {phase === "loading" && (
          <p role="status" className="text-muted-foreground text-center text-sm">
            Loading the sign-in request...
          </p>
        )}

        {phase === "failed" && (
          <div
            role="alert"
            className="border-destructive/20 bg-destructive/10 text-destructive rounded border p-3 text-sm"
          >
            {error}
            <p className="mt-2">Nothing was approved. Start again on your computer.</p>
          </div>
        )}

        {phase === "approved" && (
          <p role="status" className="text-center text-sm font-medium">
            Approved. Go back to your computer.
          </p>
        )}

        {phase === "denied" && (
          <p role="status" className="text-center text-sm font-medium">
            Request cancelled. Nothing was approved.
          </p>
        )}

        {(phase === "ready" || phase === "busy") && view && !supported && (
          <p role="alert" className="text-muted-foreground text-center text-sm">
            This browser cannot approve sign-ins. Open this link in Chrome or Safari on your phone.
          </p>
        )}

        {(phase === "ready" || phase === "busy") && view && supported && (
          <div className="space-y-5">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">{view.username}</strong> is signing in with{" "}
              {view.requester.agent || "an unknown browser"}
              {view.requester.at ? ` at ${timeOf(view.requester.at)}` : ""}
              {view.requester.ip ? ` (${view.requester.ip})` : ""}. Only approve if that is you,
              right now.
            </p>
            <div>
              <p className="mb-2 text-sm font-medium">Tap the number shown on your computer</p>
              <div className="grid grid-cols-3 gap-3">
                {view.options.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="control-lg"
                    className="text-xl"
                    aria-label={`Number ${n}`}
                    disabled={busy}
                    onClick={() => void approve(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            {notice && (
              <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                <Fingerprint className="h-4 w-4" aria-hidden="true" />
                {notice}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => void deny()}
            >
              This is not me
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default PhoneApprovePage;
