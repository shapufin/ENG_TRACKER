import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { useSiteBranding, SITE_BRANDING_QUERY_KEY } from "@/hooks/useSiteBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/FormField";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { handleApiError } from "@/lib/error-handler";
import { Save, Upload } from "lucide-react";
import { toast } from "sonner";
import type { SiteBranding } from "@/types";

type GlobalSettings = Awaited<ReturnType<typeof leaveService.getSettings>>;

const mapSettingsToForm = (settings: GlobalSettings) => ({
  default_yearly_leave_days: String(settings.default_yearly_leave_days),
  carry_over_expiry_month: String(settings.carry_over_expiry_month),
  carry_over_expiry_day: String(settings.carry_over_expiry_day),
});

const GlobalSettingsForm: React.FC<{ settings: GlobalSettings }> = ({ settings }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => mapSettingsToForm(settings));

  const update = useMutation({
    mutationFn: leaveService.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "global-settings"] });
      toast.success("Settings updated");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      default_yearly_leave_days: Number(form.default_yearly_leave_days),
      carry_over_expiry_month: Number(form.carry_over_expiry_month),
      carry_over_expiry_day: Number(form.carry_over_expiry_day),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id="settings-yearly-days"
        label="Default Yearly Vacation Days"
        type="number"
        value={form.default_yearly_leave_days}
        onChange={(v) => setForm((f) => ({ ...f, default_yearly_leave_days: v }))}
        required
      />
      <FormField
        id="settings-carryover-month"
        label="Carry-over Expiry Month"
        type="number"
        min={1}
        max={12}
        helper="1 (January) to 12 (December)."
        value={form.carry_over_expiry_month}
        onChange={(v) => setForm((f) => ({ ...f, carry_over_expiry_month: v }))}
        required
      />
      <FormField
        id="settings-carryover-day"
        label="Carry-over Expiry Day"
        type="number"
        min={1}
        max={31}
        value={form.carry_over_expiry_day}
        onChange={(v) => setForm((f) => ({ ...f, carry_over_expiry_day: v }))}
        required
      />
      <Button type="submit" size="control" disabled={update.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {update.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
};

const SiteBrandingForm: React.FC<{ branding: SiteBranding }> = ({ branding }) => {
  const queryClient = useQueryClient();
  const [siteName, setSiteName] = useState(branding.site_name);
  const [logo, setLogo] = useState<File | null>(null);

  const update = useMutation({
    mutationFn: () => dashboardService.updateBranding(branding.id, siteName, logo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SITE_BRANDING_QUERY_KEY });
      setLogo(null);
      toast.success("Branding updated");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id="branding-site-name"
        label="Site Name"
        helper="Shown in the sidebar and header."
        value={siteName}
        onChange={setSiteName}
        required
      />
      <div className="space-y-2">
        <Label htmlFor="branding-logo">Logo</Label>
        {branding.logo_url && !logo && (
          <img
            src={branding.logo_url}
            alt="Current logo"
            className="h-10 w-10 rounded object-contain"
          />
        )}
        <Input
          id="branding-logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          aria-describedby="branding-logo-helper"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
        />
        <p id="branding-logo-helper" className="text-muted-foreground text-xs">
          PNG, JPG, SVG or WebP. Leave empty to keep the current logo.
        </p>
      </div>
      <Button type="submit" size="control" disabled={update.isPending}>
        <Upload className="mr-2 h-4 w-4" />
        {update.isPending ? "Saving..." : "Save Branding"}
      </Button>
    </form>
  );
};

export const GlobalSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "global-settings"],
    queryFn: () => leaveService.getSettings(),
  });
  const { data: branding, isLoading: brandingLoading } = useSiteBranding();

  if (isLoading) return <LoadingCard rows={3} className="min-h-[300px]" />;
  if (!data)
    return (
      <ErrorCard
        title="Failed to load settings"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["admin", "global-settings"] })}
      />
    );

  const settingsKey = `${data.default_yearly_leave_days}-${data.carry_over_expiry_month}-${data.carry_over_expiry_day}`;

  return (
    <PageShell title="Global Vacation Settings" subtitle="Configure default vacation policies.">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <GlassCard delay={0} className="p-4">
          <h2 className="mb-4 text-base font-semibold">Vacation policy</h2>
          <GlobalSettingsForm key={settingsKey} settings={data} />
        </GlassCard>

        <GlassCard delay={0.05} className="p-4">
          <h2 className="mb-4 text-base font-semibold">Site Branding</h2>
          {brandingLoading && <LoadingCard rows={2} />}
          {!brandingLoading && !branding && (
            <ErrorCard
              title="Failed to load branding"
              onRetry={() => queryClient.invalidateQueries({ queryKey: SITE_BRANDING_QUERY_KEY })}
            />
          )}
          {branding && <SiteBrandingForm key={branding.id} branding={branding} />}
        </GlassCard>
      </div>
    </PageShell>
  );
};
