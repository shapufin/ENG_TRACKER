import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/lib/motion";
import type { MaintenanceStatus } from "@/types";
import { useCountdown } from "./useCountdown";

interface MaintenancePageProps {
  status: MaintenanceStatus;
  /** Rendered inside the admin preview dialog: no viewport height, tighter padding. */
  variant?: "full" | "preview";
  className?: string;
}

const DEFAULT_TITLE = "Scheduled maintenance";
const DEFAULT_MESSAGE =
  "We're updating the platform to keep it fast and reliable. Sign-in and data entry are paused until the update is complete.";

/**
 * The full-screen maintenance screen (and the admin's live preview of it).
 *
 * Design-system only: `GlassCard`, semantic tokens, the app's violet primary.
 * No raw palette classes, no hex — see the CONTEXT guardrail on `text-primary`
 * vs `bg-primary` being different roles.
 */
export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  status,
  variant = "full",
  className,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const countdown = useCountdown(status.ends_at);
  const [logoFailed, setLogoFailed] = useState(false);
  const isPreview = variant === "preview";

  return (
    <div
      className={cn(
        "bg-background relative flex items-center justify-center overflow-hidden px-4",
        isPreview ? "min-h-0 py-2" : "min-h-screen py-10",
        className
      )}
    >
      {/* Ambient bloom. Decorative only, aria-hidden, no layout impact. */}
      <div
        aria-hidden="true"
        className="bg-primary/10 pointer-events-none absolute -top-48 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-primary/5 pointer-events-none absolute -right-40 -bottom-56 h-[28rem] w-[28rem] rounded-full blur-3xl"
      />

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration: DURATION.slow, ease: EASE.inOut }
        }
        className="relative w-full max-w-xl"
      >
        <GlassCard glow="primary" animateOnMount={false} className={cn(isPreview ? "p-6" : "p-6 sm:p-10")}>
          <div className="flex flex-col items-center text-center">
            {status.logo_url && !logoFailed ? (
              <img
                src={status.logo_url}
                alt=""
                className="mb-4 h-12 w-12 rounded-xl object-contain shadow-md"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="bg-primary/10 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full">
                <Wrench className="text-primary h-6 w-6" aria-hidden="true" />
              </div>
            )}

            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-[0.22em] uppercase">
              {status.site_name}
            </p>

            <Badge variant="warning" className="gap-2">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span
                  className={cn(
                    "bg-warning absolute inline-flex h-full w-full rounded-full opacity-60",
                    !shouldReduceMotion && "animate-ping"
                  )}
                />
                <span className="bg-warning relative inline-flex h-2 w-2 rounded-full" />
              </span>
              Maintenance in progress
            </Badge>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {status.title || DEFAULT_TITLE}
            </h1>
            <p className="text-muted-foreground mt-3 text-sm text-pretty sm:text-base">
              {status.message || DEFAULT_MESSAGE}
            </p>

            <div className="border-line-subtle bg-muted/40 mt-6 w-full rounded-lg border px-4 py-4">
              {countdown.hasDeadline && !countdown.expired ? (
                <>
                  <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                    Expected back in
                  </p>
                  {/* The ticking clock is announced nowhere: a live region that
                      changes every second talks over the page. The static
                      deadline line below is the one announced summary. */}
                  <p
                    aria-hidden="true"
                    className="mt-1 font-mono text-2xl font-semibold tabular-nums"
                  >
                    {countdown.label}
                  </p>
                  <p role="status" className="text-muted-foreground mt-1 text-xs">
                    Around {countdown.deadlineLabel}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                    Status
                  </p>
                  <p role="status" className="mt-1 text-sm font-medium">
                    We'll be back as soon as the update is complete.
                  </p>
                </>
              )}
            </div>

            <div
              aria-hidden="true"
              className="bg-muted mt-6 h-1 w-full overflow-hidden rounded-full"
            >
              <div
                className={cn(
                  "bg-primary h-full w-1/3 rounded-full",
                  !shouldReduceMotion && "animate-pulse"
                )}
              />
            </div>

            <p className="text-muted-foreground mt-5 text-xs">
              Administrators can still sign in.{" "}
              <Link
                to="/login?admin=1"
                className="text-primary hover:text-primary-hover inline-flex items-center gap-1 underline underline-offset-4"
              >
                Administrator sign in
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};
