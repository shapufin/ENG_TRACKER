import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePermissions } from "@/context/PermissionContext";
import { handleApiError } from "@/lib/error-handler";
import { leaveService } from "@/services/leaveService";

interface TwoFactorPolicyCardProps {
  required: boolean;
  className?: string;
}

/**
 * Company-wide two-factor requirement. Saves on its own (not with the vacation
 * form) and asks first, because it changes how everyone signs in. Superuser-only
 * on the server; staff see the state but cannot change it.
 */
export const TwoFactorPolicyCard: React.FC<TwoFactorPolicyCardProps> = ({ required, className }) => {
  const queryClient = useQueryClient();
  const { isSuperuser } = usePermissions();
  const [pending, setPending] = useState<boolean | null>(null);

  const save = useMutation({
    mutationFn: (next: boolean) => leaveService.updateSettings({ mfa_required: next }),
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "global-settings"] });
      toast.success(next ? "Two-factor is now required for everyone" : "Two-factor is no longer required for everyone");
      setPending(null);
    },
    onError: (err: unknown) => {
      handleApiError(err);
      setPending(null);
    },
  });

  return (
    <GlassCard delay={0} className={className}>
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2 border-b pb-3">
          <ShieldCheck className="text-primary h-5 w-5" aria-hidden="true" />
          <h3 className="text-base font-semibold">Two-factor authentication</h3>
          <Badge variant={required ? "default" : "secondary"} className="ml-auto">
            {required ? "Required for everyone" : "Optional"}
          </Badge>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="mfa-global-required" className="text-sm font-semibold">
              Require two-factor for all users
            </Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Everyone must sign in with a code from an authenticator app. Nobody is signed out when
              you turn this on: people without it set up are walked through setup at their next
              sign-in. Individual people can also be required from the Users page while this stays
              off.
              {!isSuperuser && " Only a superuser can change this."}
            </p>
          </div>
          <Switch
            id="mfa-global-required"
            checked={required}
            disabled={!isSuperuser || save.isPending}
            onCheckedChange={(checked) => setPending(checked)}
          />
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? "Require two-factor for everyone?" : "Stop requiring two-factor for everyone?"}
        description={
          pending
            ? "Every user will have to set up an authenticator app at their next sign-in, and use it from then on. Until someone finishes setup, a stolen password alone is still enough for that account."
            : "People who already set up two-factor keep it and are still asked for a code. Only the company-wide requirement is lifted; people required individually stay required."
        }
        confirmLabel={pending ? "Require for everyone" : "Stop requiring"}
        variant={pending ? "default" : "destructive"}
        isConfirming={save.isPending}
        onConfirm={() => pending !== null && save.mutate(pending)}
      />
    </GlassCard>
  );
};
