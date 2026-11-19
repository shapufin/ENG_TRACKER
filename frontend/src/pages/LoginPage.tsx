import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { computePermissions } from "@/context/computePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { Fingerprint, LogIn, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useMaintenanceStatus } from "@/hooks/useMaintenanceStatus";
import { isMaintenanceError } from "@/lib/api";
import { BackupCodesPanel } from "@/components/auth/BackupCodesPanel";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { PhoneApprovalWait, type PhoneWaitEnd } from "@/components/auth/PhoneApprovalWait";
import { mfaErrorMessage } from "@/services/mfaService";
import { PasskeyCancelledError, isPasskeySupported } from "@/services/passkeyService";
import { requestPhoneApproval } from "@/services/phoneApprovalService";
import {
  isMfaChallenge,
  type AuthResponse,
  type MfaSetupData,
  type PhoneApprovalStart,
  type User,
} from "@/types";

type Step = "password" | "phone" | "passkey" | "code" | "choose" | "setup" | "backup";

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  password: { title: "", subtitle: "Sign in to your account" },
  phone: {
    title: "Two-factor authentication",
    subtitle: "Approve this sign-in with the fingerprint or face on your phone.",
  },
  passkey: {
    title: "Two-factor authentication",
    subtitle: "Confirm it is you with Face ID, your fingerprint or your device PIN.",
  },
  code: {
    title: "Two-factor authentication",
    subtitle: "Enter the code from your authenticator app.",
  },
  choose: {
    title: "Set up two-factor authentication",
    subtitle: "Your account needs a second step. Choose how you want to confirm it is you.",
  },
  setup: {
    title: "Set up two-factor authentication",
    subtitle: "Your account needs a second step before you can sign in.",
  },
  backup: {
    title: "Save your backup codes",
    subtitle: "Two-factor authentication is on and you are signed in.",
  },
};

/** Where a freshly signed-in user lands. Order matters (see comments). */
const homePathFor = (user: User): string => {
  if (user.is_superuser || user.is_staff) return "/admin";
  // CR-only admin's home is the admin panel Users page (they manage CR access + view CR
  // users). is_cr_admin() is True for is_staff users too, so the is_staff check MUST come first.
  if (user.is_cr_admin) return "/admin/users";
  // CR user (non-admin with ControlRoomAccess): standby coverage for their scoped teams.
  if (user.has_control_room_access) return "/control-room/dashboard";
  // An HBPR-only user has no dashboard. After the CR checks: an HBPR who also holds
  // ControlRoomAccess still lands on the CR home.
  if (computePermissions(user).isHBPROnly) return "/hbpr";
  return "/dashboard";
};

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("password");
  const [mfaToken, setMfaToken] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [signedIn, setSignedIn] = useState<AuthResponse | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [methods, setMethods] = useState<Array<"passkey" | "phone" | "totp">>([]);
  const [phoneRequest, setPhoneRequest] = useState<PhoneApprovalStart | null>(null);
  const {
    login,
    verifyMfa,
    verifyPasskey,
    startLoginSetup,
    finishLoginSetup,
    finishLoginPasskeySetup,
  } = useAuth();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { data: branding } = useSiteBranding();
  const { data: maintenance } = useMaintenanceStatus();
  const [logoFailed, setLogoFailed] = useState(false);

  // The backup codes exist only on this screen: warn before a reload or tab close loses them.
  const codesUnsaved = step === "backup" && !acknowledged;
  useEffect(() => {
    if (!codesUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [codesUnsaved]);

  const backToPassword = (message = "") => {
    setStep("password");
    setMfaToken("");
    setCode("");
    setUseBackupCode(false);
    setSetupData(null);
    setMethods([]);
    setPhoneRequest(null);
    setPassword("");
    setError(message);
  };

  // An expired or voided challenge (401) cannot be retried: start over from the password.
  const handleStepError = (err: unknown, fallback: string) => {
    const data = (err as { response?: { data?: { code?: string } } })?.response?.data;
    if (data?.code === "challenge_invalid") {
      backToPassword(mfaErrorMessage(err, "Your sign-in timed out. Enter your password again."));
      return;
    }
    if (isMaintenanceError(err)) {
      setError("The platform is under maintenance. Only administrators can sign in right now.");
      return;
    }
    setError(mfaErrorMessage(err, fallback));
  };

  const handlePasswordSubmit = async () => {
    try {
      const data = await login({ username, password });
      if (!isMfaChallenge(data)) {
        navigate(homePathFor(data.user));
        return;
      }
      setMfaToken(data.mfa_token);
      setPassword("");
      const offered = data.methods ?? [];
      setMethods(offered);
      const passkeyUsable = offered.includes("passkey") && isPasskeySupported();
      if (data.mfa_setup_required) {
        if (passkeyUsable) {
          setStep("choose");
        } else {
          setSetupData(await startLoginSetup(data.mfa_token));
          setStep("setup");
        }
      } else if (offered.includes("phone")) {
        setStep("phone");
      } else if (passkeyUsable) {
        setStep("passkey");
      } else if (data.methods && !offered.includes("totp")) {
        // A passkey-only account on a browser that cannot use one: a code field would be a dead end.
        backToPassword(
          "This account signs in with a passkey, which this browser does not support. Use another browser or device, or ask an administrator to reset two-factor authentication."
        );
      } else {
        setStep("code");
      }
    } catch (err) {
      setError(
        isMaintenanceError(err)
          ? "The platform is under maintenance. Only administrators can sign in right now."
          : "Invalid username or password"
      );
    }
  };

  const handleCodeSubmit = async () => {
    try {
      const data = await verifyMfa(mfaToken, code);
      navigate(homePathFor(data.user));
    } catch (err) {
      setCode("");
      handleStepError(err, "That code did not work. Try again.");
    }
  };

  const handlePasskeySubmit = async () => {
    try {
      const data = await verifyPasskey(mfaToken);
      navigate(homePathFor(data.user));
    } catch (err) {
      // A dismissed prompt is the person's choice, not a failure: stay put, no alert.
      if (err instanceof PasskeyCancelledError) return;
      handleStepError(err, "The passkey did not work. Try again, or use a code instead.");
    }
  };

  const handlePhoneStart = async () => {
    try {
      setPhoneRequest(await requestPhoneApproval(mfaToken, "push"));
    } catch (err) {
      handleStepError(err, "The request could not be sent. Try again, or use a code instead.");
    }
  };

  const handlePhoneEnded = (reason: PhoneWaitEnd) => {
    setPhoneRequest(null);
    setError(
      reason === "denied"
        ? "The request was denied on your phone. Nothing was approved. Send it again if it was you, or use a code instead."
        : "The request expired before your phone approved it. Send it again, or use a code instead."
    );
  };

  const goToStep = (next: Step) => {
    setPhoneRequest(null);
    setStep(next);
    setCode("");
    setError("");
  };

  const handlePasskeySetup = async () => {
    setError("");
    setIsLoading(true);
    try {
      const data = await finishLoginPasskeySetup(mfaToken, "This device");
      navigate(homePathFor(data.user));
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return;
      handleStepError(
        err,
        "The passkey could not be set up. Try again, or use an authenticator app."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseApp = async () => {
    setError("");
    setIsLoading(true);
    try {
      setSetupData(await startLoginSetup(mfaToken));
      setStep("setup");
    } catch (err) {
      handleStepError(err, "Setup could not start. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupSubmit = async () => {
    try {
      const data = await finishLoginSetup(mfaToken, code);
      setSignedIn(data);
      setStep("backup");
    } catch (err) {
      setCode("");
      handleStepError(err, "That code did not work. Try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      if (step === "password") await handlePasswordSubmit();
      else if (step === "phone") await handlePhoneStart();
      else if (step === "passkey") await handlePasskeySubmit();
      else if (step === "code") await handleCodeSubmit();
      else if (step === "setup") await handleSetupSubmit();
      else if (signedIn) navigate(homePathFor(signedIn.user));
    } finally {
      setIsLoading(false);
    }
  };

  const copy = STEP_COPY[step];
  const submitLabel = {
    password: isLoading ? "Signing in..." : "Sign In",
    phone: isLoading ? "Sending to your phone..." : "Approve on my phone",
    passkey: isLoading ? "Waiting for your device..." : "Use Face ID or fingerprint",
    choose: "",
    code: isLoading ? "Verifying..." : "Verify",
    setup: isLoading ? "Verifying..." : "Turn on and sign in",
    backup: "Continue",
  }[step];
  const submitDisabled = isLoading || (step === "backup" && !acknowledged);
  const canUsePasskey = methods.includes("passkey") && isPasskeySupported();
  const canUsePhone = methods.includes("phone");
  const canUseCode = methods.length === 0 || methods.includes("totp");

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45 }}
        className="w-full max-w-md"
      >
        <GlassCard delay={0} className="p-8">
          <div className="mb-6 text-center">
            {branding?.logo_url && !logoFailed ? (
              <img
                src={branding.logo_url}
                alt=""
                className="mx-auto mb-3 h-12 w-12 rounded-xl object-contain shadow-md"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="bg-primary/10 mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full">
                {step === "password" ? (
                  <LogIn className="text-primary h-6 w-6" />
                ) : (
                  <ShieldCheck className="text-primary h-6 w-6" />
                )}
              </div>
            )}
            <h1 className="text-2xl font-bold">
              {copy.title || branding?.site_name || "Engineering Tracker"}
            </h1>
            <p className="text-muted-foreground mt-1">{copy.subtitle}</p>
          </div>

          {maintenance?.active && (
            <div
              role="status"
              className="border-tone-warning-border bg-tone-warning-surface text-tone-warning-text mb-4 flex items-start gap-3 rounded border p-3 text-sm"
            >
              <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Maintenance mode is on.</strong> Only
                administrators can sign in until the update is complete.
              </span>
            </div>
          )}

          {error &&
            (step === "password" ||
              step === "backup" ||
              step === "phone" ||
              step === "passkey" ||
              step === "choose") && (
              <div
                role="alert"
                className="border-destructive/20 bg-destructive/10 text-destructive mb-4 rounded border p-3 text-sm"
              >
                {error}
              </div>
            )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === "password" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {step === "phone" && phoneRequest && (
              <PhoneApprovalWait
                mfaToken={mfaToken}
                request={phoneRequest}
                onSignedIn={(data) => navigate(homePathFor(data.user))}
                onEnded={handlePhoneEnded}
                onError={(err) => {
                  setPhoneRequest(null);
                  handleStepError(
                    err,
                    "Waiting for your phone failed. Send the request again, or use a code instead."
                  );
                }}
              />
            )}

            {step === "phone" && !phoneRequest && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <Smartphone className="text-primary h-10 w-10" aria-hidden="true" />
                <p className="text-muted-foreground text-sm">
                  We will send a notification to your phone. Tap the number shown here, then confirm
                  with your fingerprint or face.
                </p>
              </div>
            )}

            {step === "passkey" && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <Fingerprint className="text-primary h-10 w-10" aria-hidden="true" />
                <p className="text-muted-foreground text-sm">
                  Your device will ask for Face ID, your fingerprint or your PIN. Nothing to type.
                </p>
              </div>
            )}

            {step === "choose" && (
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full"
                  onClick={handlePasskeySetup}
                  disabled={isLoading}
                >
                  <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
                  Set up Face ID or fingerprint
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleChooseApp}
                  disabled={isLoading}
                >
                  Use an authenticator app
                </Button>
              </div>
            )}

            {step === "code" && (
              <>
                <MfaCodeField
                  key={useBackupCode ? "backup" : "totp"}
                  id="mfa-code"
                  kind={useBackupCode ? "backup" : "totp"}
                  value={code}
                  onChange={setCode}
                  error={error}
                  autoFocus
                />
                <button
                  type="button"
                  className="text-primary hover:text-primary-hover inline-flex min-h-6 items-center text-sm underline-offset-4 hover:underline"
                  onClick={() => {
                    setUseBackupCode((v) => !v);
                    setCode("");
                    setError("");
                  }}
                >
                  {useBackupCode ? "Use my authenticator app instead" : "Use a backup code instead"}
                </button>
                {canUsePasskey && (
                  <button
                    type="button"
                    className="text-primary hover:text-primary-hover block min-h-6 text-sm underline-offset-4 hover:underline"
                    onClick={() => goToStep("passkey")}
                  >
                    Use my passkey instead
                  </button>
                )}
                {canUsePhone && (
                  <button
                    type="button"
                    className="text-primary hover:text-primary-hover block min-h-6 text-sm underline-offset-4 hover:underline"
                    onClick={() => goToStep("phone")}
                  >
                    Approve on my phone instead
                  </button>
                )}
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Having trouble? Make sure automatic date and time is turned on on your device, or
                  wait for the next code. If you lost access, use a backup code or ask an
                  administrator to reset two-factor authentication.
                </p>
              </>
            )}

            {step === "setup" && setupData && (
              <MfaEnrollment
                setup={setupData}
                code={code}
                onCodeChange={setCode}
                error={error}
                idPrefix="login"
              />
            )}

            {step === "backup" && signedIn?.backup_codes && (
              <BackupCodesPanel
                codes={signedIn.backup_codes}
                acknowledged={acknowledged}
                onAcknowledgedChange={setAcknowledged}
                idPrefix="login"
              />
            )}

            {step !== "choose" && !(step === "phone" && phoneRequest) && (
              <Button
                type="submit"
                className="w-full"
                disabled={submitDisabled}
                autoFocus={step === "passkey" || step === "phone"}
              >
                {submitLabel}
              </Button>
            )}
            {step === "phone" && canUsePasskey && !phoneRequest && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => goToStep("passkey")}
                disabled={isLoading}
              >
                Use my passkey instead
              </Button>
            )}
            {step === "passkey" && canUsePhone && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => goToStep("phone")}
                disabled={isLoading}
              >
                Approve on my phone instead
              </Button>
            )}
            {(step === "passkey" || step === "phone") && canUseCode && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => goToStep("code")}
                disabled={isLoading}
              >
                Use a code instead
              </Button>
            )}
            {(step === "phone" ||
              step === "passkey" ||
              step === "code" ||
              step === "choose" ||
              step === "setup") && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => backToPassword()}
                disabled={isLoading}
              >
                Back to sign in
              </Button>
            )}
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
};
