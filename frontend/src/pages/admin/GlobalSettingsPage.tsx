import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="space-y-2">
        <Label htmlFor="settings-yearly-days">Default Yearly Vacation Days</Label>
        <Input
          id="settings-yearly-days"
          type="number"
          value={form.default_yearly_leave_days}
          onChange={(e) => setForm((f) => ({ ...f, default_yearly_leave_days: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-carryover-month">Carry-over Expiry Month</Label>
        <Input
          id="settings-carryover-month"
          type="number"
          min={1}
          max={12}
          value={form.carry_over_expiry_month}
          onChange={(e) => setForm((f) => ({ ...f, carry_over_expiry_month: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-carryover-day">Carry-over Expiry Day</Label>
        <Input
          id="settings-carryover-day"
          type="number"
          min={1}
          max={31}
          value={form.carry_over_expiry_day}
          onChange={(e) => setForm((f) => ({ ...f, carry_over_expiry_day: e.target.value }))}
          required
        />
      </div>
      <Button type="submit" disabled={update.isPending}>
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
      queryClient.invalidateQueries({ queryKey: ["admin", "site-branding"] });
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
      <div className="space-y-2">
        <Label htmlFor="branding-site-name">Site Name</Label>
        <Input
          id="branding-site-name"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">Shown in the sidebar and header.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="branding-logo">Logo</Label>
        {branding.logo_url && !logo && (
          <img src={branding.logo_url} alt="Current logo" className="h-10 w-10 rounded object-contain" />
        )}
        <Input
          id="branding-logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Leave empty to keep the current logo.</p>
      </div>
      <Button type="submit" disabled={update.isPending}>
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
  const { data: branding, isLoading: brandingLoading } = useQuery({
    queryKey: ["admin", "site-branding"],
    queryFn: () => dashboardService.getBranding(),
  });

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
      <div className="flex flex-col gap-6">
        <GlassCard delay={0} className="max-w-md p-6">
          <GlobalSettingsForm key={settingsKey} settings={data} />
        </GlassCard>

        <GlassCard delay={0.05} className="max-w-md p-6">
          <h2 className="mb-4 text-lg font-semibold">Site Branding</h2>
          {brandingLoading && <LoadingCard rows={2} />}
          {!brandingLoading && !branding && (
            <ErrorCard
              title="Failed to load branding"
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["admin", "site-branding"] })}
            />
          )}
          {branding && <SiteBrandingForm key={branding.id} branding={branding} />}
        </GlassCard>
      </div>
    </PageShell>
  );
};
