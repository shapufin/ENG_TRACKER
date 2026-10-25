import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { computePermissions } from "@/context/computePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { LogIn, ShieldCheck } from "lucide-react";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { BackupCodesPanel } from "@/components/auth/BackupCodesPanel";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { mfaErrorMessage } from "@/services/mfaService";
import { isMfaChallenge, type AuthResponse, type MfaSetupData, type User } from "@/types";

type Step = "password" | "code" | "setup" | "backup";

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  password: { title: "", subtitle: "Sign in to your account" },
  code: {
    title: "Two-factor authentication",
    subtitle: "Enter the code from your authenticator app.",
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
  const { login, verifyMfa, startLoginSetup, finishLoginSetup } = useAuth();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { data: branding } = useSiteBranding();
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
      if (data.mfa_setup_required) {
        setSetupData(await startLoginSetup(data.mfa_token));
        setStep("setup");
      } else {
        setStep("code");
      }
    } catch {
      setError("Invalid username or password");
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
    code: isLoading ? "Verifying..." : "Verify",
    setup: isLoading ? "Verifying..." : "Turn on and sign in",
    backup: "Continue",
  }[step];
  const submitDisabled = isLoading || (step === "backup" && !acknowledged);

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

          {error && (step === "password" || step === "backup") && (
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

            <Button type="submit" className="w-full" disabled={submitDisabled}>
              {submitLabel}
            </Button>
            {(step === "code" || step === "setup") && (
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
