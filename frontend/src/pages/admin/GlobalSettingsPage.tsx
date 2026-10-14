import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { useSiteBranding, SITE_BRANDING_QUERY_KEY } from "@/hooks/useSiteBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { handleApiError } from "@/lib/error-handler";
import { Save, Upload } from "lucide-react";
import { toast } from "sonner";
import type { SiteBranding } from "@/types";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en", { month: "long" })
);

type GlobalSettings = Awaited<ReturnType<typeof leaveService.getSettings>>;

const mapSettingsToForm = (settings: GlobalSettings) => ({
  default_yearly_leave_days: String(settings.default_yearly_leave_days),
  carry_over_expiry_month: String(settings.carry_over_expiry_month),
  carry_over_expiry_day: String(settings.carry_over_expiry_day),
  carry_over_enabled: settings.carry_over_enabled,
});

// Carry from the year that is closing now expires on this date next year.
// Clamps like the backend: 31 Feb becomes the last day of that month.
const carryExpiryPreview = (month: number, day: number) => {
  const nextYear = new Date().getFullYear() + 1;
  const lastDay = new Date(nextYear, month, 0).getDate();
  const expiry = new Date(nextYear, month - 1, Math.min(day, lastDay));
  return expiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const GlobalSettingsForm: React.FC<{ settings: GlobalSettings }> = ({ settings }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => mapSettingsToForm(settings));

  const update = useMutation({
    mutationFn: leaveService.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "global-settings"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["leave-management"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      carry_over_enabled: form.carry_over_enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="settings-yearly-days">Default Yearly Vacation Days</Label>
        <Input
          id="settings-yearly-days"
          type="number"
          min={0}
          max={365}
          value={form.default_yearly_leave_days}
          onChange={(e) => setForm((f) => ({ ...f, default_yearly_leave_days: e.target.value }))}
          required
        />
        <p className="text-muted-foreground text-xs">
          Default vacation days allocated when new employee balances or new yearly cycles are
          initialized. Individual balances can be adjusted in Leave Balances.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-carryover-month">Carry-over Expiry Month</Label>
        <Select
          value={form.carry_over_expiry_month}
          onValueChange={(v) => setForm((f) => ({ ...f, carry_over_expiry_month: v }))}
        >
          <SelectTrigger id="settings-carryover-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <p className="text-muted-foreground text-xs" data-testid="carryover-expiry-preview">
          Carry-over from {new Date().getFullYear()} expires{" "}
          {carryExpiryPreview(
            Number(form.carry_over_expiry_month),
            Number(form.carry_over_expiry_day)
          )}
          . Changing this date also moves the expiry of carry-over already granted.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="settings-carryover-enabled">Carry unused vacation to next year</Label>
          <p className="text-muted-foreground text-xs">
            Off stops new carry-over at year end. Existing carry-over still runs to its expiry.
          </p>
        </div>
        <Switch
          id="settings-carryover-enabled"
          checked={form.carry_over_enabled}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, carry_over_enabled: checked }))}
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
  const logoInputRef = useRef<HTMLInputElement>(null);

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
      <div className="space-y-2">
        <Label htmlFor="branding-site-name">Site Name</Label>
        <Input
          id="branding-site-name"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          required
        />
        <p className="text-muted-foreground text-xs">Shown in the sidebar and header.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="branding-logo">Logo</Label>
        {branding.logo_url && !logo && (
          <img
            src={branding.logo_url}
            alt="Current logo"
            className="h-10 w-10 rounded object-contain"
          />
        )}
        <div className="flex items-center gap-3">
          <input
            ref={logoInputRef}
            id="branding-logo"
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="control"
            onClick={() => logoInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Choose file
          </Button>
          <span className="text-muted-foreground truncate text-sm">
            {logo?.name ?? "No file chosen"}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          PNG, JPG, SVG or WebP. Leave empty to keep the current logo.
        </p>
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
              onRetry={() => queryClient.invalidateQueries({ queryKey: SITE_BRANDING_QUERY_KEY })}
            />
          )}
          {branding && <SiteBrandingForm key={branding.id} branding={branding} />}
        </GlassCard>
      </div>
    </PageShell>
  );
};
