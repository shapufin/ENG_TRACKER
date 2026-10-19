import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { usePlugins } from "@/context/PluginContext";
import { useSiteBranding, SITE_BRANDING_QUERY_KEY } from "@/hooks/useSiteBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { handleApiError } from "@/lib/error-handler";
import {
  Save,
  Upload,
  Sparkles,
  CalendarCheck,
  Clock,
  ShieldCheck,
  Building2,
  CalendarDays,
  ExternalLink,
  CheckCircle2,
  Info,
  Layers,
  ArrowRight,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteBranding } from "@/types";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en", { month: "long" })
);

// Browser's IANA list; the stored value is always offered even if it is not in it.
const timezoneOptions = (current: string) => {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
};

type GlobalSettings = Awaited<ReturnType<typeof leaveService.getSettings>>;

const mapSettingsToForm = (settings: GlobalSettings) => ({
  default_yearly_leave_days: String(settings.default_yearly_leave_days),
  carry_over_expiry_month: String(settings.carry_over_expiry_month),
  carry_over_expiry_day: String(settings.carry_over_expiry_day),
  carry_over_enabled: settings.carry_over_enabled,
  business_timezone: settings.business_timezone,
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
      business_timezone: form.business_timezone,
    });
  };

  const calculatedExpiry = carryExpiryPreview(
    Number(form.carry_over_expiry_month),
    Number(form.carry_over_expiry_day)
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Form column */}
      <GlassCard delay={0} className="p-6 lg:col-span-7">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-lg font-semibold">Vacation & Carry-Over Policy</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Configure baseline vacation allocation and year-end carry-over rules.
            </p>
          </div>
          <Badge variant={form.carry_over_enabled ? "default" : "secondary"}>
            {form.carry_over_enabled ? "Carry-Over Active" : "Carry-Over Disabled"}
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="settings-yearly-days" className="font-medium">
                Default Yearly Vacation Days
              </Label>
              <span className="text-muted-foreground font-mono text-xs">0 – 365 days</span>
            </div>
            <Input
              id="settings-yearly-days"
              type="number"
              min={0}
              max={365}
              value={form.default_yearly_leave_days}
              onChange={(e) =>
                setForm((f) => ({ ...f, default_yearly_leave_days: e.target.value }))
              }
              required
            />
            <p className="text-muted-foreground text-xs">
              Default vacation days allocated when new employee balances or new yearly cycles are
              initialized. Individual balances can be adjusted in Leave Balances.
            </p>
          </div>

          <div className="border-border/80 bg-surface-sunken/40 space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="settings-carryover-enabled" className="text-sm font-semibold">
                  Carry unused vacation to next year
                </Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  When turned off, no new carry-over balance is granted at year-end. Existing
                  carry-over balances still run until their expiration date.
                </p>
              </div>
              <Switch
                id="settings-carryover-enabled"
                checked={form.carry_over_enabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, carry_over_enabled: checked }))
                }
              />
            </div>

            {form.carry_over_enabled && (
              <div className="border-border/60 grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, carry_over_expiry_day: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            )}

            <p className="text-muted-foreground text-xs" data-testid="carryover-expiry-preview">
              Carry-over from {new Date().getFullYear()} expires{" "}
              <span className="text-foreground font-medium">{calculatedExpiry}</span>. Changing this
              date also moves the expiry of carry-over already granted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-business-timezone" className="font-medium">
              Business timezone
            </Label>
            <Select
              value={form.business_timezone}
              onValueChange={(v) => setForm((f) => ({ ...f, business_timezone: v }))}
            >
              <SelectTrigger id="settings-business-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions(settings.business_timezone).map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Decides which calendar day it is for deadlines, month cut-offs and reports. Stored
              times stay in UTC. Already computed engagement months are not recalculated when this
              changes.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={update.isPending} className="min-w-[140px]">
              <Save className="mr-2 h-4 w-4" />
              {update.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Explainer / Calculator card */}
      <GlassCard delay={0.05} className="flex flex-col justify-between p-6 lg:col-span-5">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="bg-primary/10 text-primary rounded-lg p-2">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Policy Lifecycle & Expiry</h3>
              <p className="text-muted-foreground text-xs">How vacation days roll over</p>
            </div>
          </div>

          <div className="my-4 space-y-4">
            <div className="border-primary/20 bg-primary/5 rounded-xl border p-3.5">
              <div className="text-primary text-xs font-semibold tracking-wider uppercase">
                Next Carry-Over Expiration
              </div>
              <div className="text-foreground mt-1 text-xl font-bold">{calculatedExpiry}</div>
              <p className="text-muted-foreground mt-1 text-xs">
                Active carry-over balances in the current cycle will automatically expire on this
                day.
              </p>
            </div>

            <div className="text-muted-foreground space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <div className="bg-muted text-foreground mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                  1
                </div>
                <div>
                  <strong className="text-foreground">Annual Baseline:</strong> Each employee
                  receives {form.default_yearly_leave_days || 21} vacation days per calendar year.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="bg-muted text-foreground mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                  2
                </div>
                <div>
                  <strong className="text-foreground">Year-End Carry:</strong>{" "}
                  {form.carry_over_enabled
                    ? "Unused days roll into next year with a temporary expiry stamp."
                    : "Carry-over is currently disabled."}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="bg-muted text-foreground mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                  3
                </div>
                <div>
                  <strong className="text-foreground">Auto-Expiry:</strong> Carried-over days must
                  be taken before the expiry date or they forfeit cleanly.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/40 border-border/60 text-muted-foreground flex items-center justify-between rounded-lg border p-3 text-xs">
          <span>Manage individual employee allocations:</span>
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
            <a href="/admin/leave-balances">
              Leave Balances <ArrowRight className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </div>
      </GlassCard>
    </div>
  );
};

const SiteBrandingForm: React.FC<{ branding: SiteBranding }> = ({ branding }) => {
  const queryClient = useQueryClient();
  const [siteName, setSiteName] = useState(branding.site_name);
  const [logo, setLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const update = useMutation({
    mutationFn: () => dashboardService.updateBranding(branding.id, siteName, logo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SITE_BRANDING_QUERY_KEY });
      setLogo(null);
      setPreviewUrl(null);
      toast.success("Branding updated");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const handleFileChange = (file: File | null) => {
    setLogo(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate();
  };

  const activeLogo = previewUrl || branding.logo_url;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Form Column */}
      <GlassCard delay={0} className="p-6 lg:col-span-6">
        <div className="mb-6 border-b pb-4">
          <h2 className="text-lg font-semibold">Organization & Site Identity</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Configure application name and company logo displayed in headers, navigation, and login.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="branding-site-name" className="font-medium">
              Site Name
            </Label>
            <Input
              id="branding-site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Engineering Operations Tracker"
              required
            />
            <p className="text-muted-foreground text-xs">
              Displayed on browser tab titles, navigation bars, and authentication portals.
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="branding-logo" className="font-medium">
              Logo
            </Label>

            <div className="border-border bg-muted/20 flex items-center gap-4 rounded-xl border border-dashed p-4">
              <div className="bg-surface-sunken border-border flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                {activeLogo ? (
                  <img src={activeLogo} alt="Logo preview" className="h-12 w-12 object-contain" />
                ) : (
                  <Building2 className="text-muted-foreground h-6 w-6" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <input
                  ref={logoInputRef}
                  id="branding-logo"
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="control"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    Choose file
                  </Button>
                  {logo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileChange(null)}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 truncate text-xs">
                  {logo?.name ?? "No file chosen"}
                </div>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              Recommended: transparent PNG or SVG, max 2MB. Leave empty to keep existing logo.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={update.isPending} className="min-w-[140px]">
              <Upload className="mr-2 h-4 w-4" />
              {update.isPending ? "Saving..." : "Save Branding"}
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Live Preview Column */}
      <GlassCard delay={0.05} className="space-y-5 p-6 lg:col-span-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary rounded-lg p-2">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Live Identity Mockup</h3>
              <p className="text-muted-foreground text-xs">Real-time preview across app surfaces</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Dynamic Preview
          </Badge>
        </div>

        {/* Mockup 1: Top Bar Header */}
        <div className="border-border bg-card space-y-2 rounded-xl border p-3 shadow-sm">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Navigation Header Preview
          </div>
          <div className="bg-surface-sunken/60 border-border/60 flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex items-center gap-2.5">
              {activeLogo ? (
                <img src={activeLogo} alt="" className="h-6 w-6 object-contain" />
              ) : (
                <div className="bg-primary/20 text-primary flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
                  {(siteName || "E")[0]}
                </div>
              )}
              <span className="max-w-[180px] truncate text-sm font-semibold">
                {siteName || "Engineering Tracker"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted/60 hidden h-6 w-16 animate-pulse rounded sm:block" />
              <div className="bg-primary/20 text-primary flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold">
                AD
              </div>
            </div>
          </div>
        </div>

        {/* Mockup 2: Login Card Preview */}
        <div className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-sm">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Login Screen Preview
          </div>
          <div className="bg-background border-border/80 flex flex-col items-center rounded-lg border p-4 text-center">
            <div className="bg-surface-sunken border-border mb-2 flex h-10 w-10 items-center justify-center rounded-lg border">
              {activeLogo ? (
                <img src={activeLogo} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <Building2 className="text-muted-foreground h-5 w-5" />
              )}
            </div>
            <h4 className="text-foreground text-sm font-bold">
              {siteName || "Engineering Tracker"}
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Sign in to manage your engineering records
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export const GlobalSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("branding");
  const { activePlugins } = usePlugins();
  const isPayrollActive = activePlugins.some((p) => p.name === "payroll");

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
    <PageShell
      title="Global Application Settings"
      subtitle="Manage organization identity, leave policies, workweek defaults, and core system parameters."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden text-xs sm:inline-flex">
            {branding?.site_name || "Engineering Tracker"}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {data.default_yearly_leave_days}d Vacation Baseline
          </Badge>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-auto">
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Branding & Identity</span>
          </TabsTrigger>
          <TabsTrigger value="vacation" className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            <span>Vacation & Carry-Over</span>
          </TabsTrigger>
          <TabsTrigger value="workplace" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Workplace & Hours</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span>System & Operations</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Branding & Identity */}
        <TabsContent
          value="branding"
          forceMount
          className={activeTab === "branding" ? "block" : "hidden"}
        >
          {brandingLoading && <LoadingCard rows={2} />}
          {!brandingLoading && !branding && (
            <ErrorCard
              title="Failed to load branding"
              onRetry={() => queryClient.invalidateQueries({ queryKey: SITE_BRANDING_QUERY_KEY })}
            />
          )}
          {branding && <SiteBrandingForm key={branding.id} branding={branding} />}
        </TabsContent>

        {/* Tab 2: Vacation & Carry-Over Policies */}
        <TabsContent
          value="vacation"
          forceMount
          className={activeTab === "vacation" ? "block" : "hidden"}
        >
          <GlobalSettingsForm key={settingsKey} settings={data} />
        </TabsContent>

        {/* Tab 3: Workplace & Schedules */}
        <TabsContent
          value="workplace"
          forceMount
          className={activeTab === "workplace" ? "block" : "hidden"}
        >
          <div className={`grid gap-6 ${isPayrollActive ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <GlassCard delay={0} className="space-y-4 p-6">
              <div className="bg-primary/10 text-primary w-fit rounded-xl p-2.5">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Standard Daily Hours</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Baseline working day duration across all teams.
                </p>
              </div>
              <div className="text-foreground text-2xl font-bold">8.0 hrs / day</div>
              <div className="text-muted-foreground border-border/60 border-t pt-2 text-xs">
                Standard full-time weekly total:{" "}
                <strong className="text-foreground">40.0 hours</strong> (Monday through Friday).
              </div>
            </GlassCard>

            <GlassCard delay={0.05} className="flex flex-col justify-between space-y-4 p-6">
              <div>
                <div className="bg-tone-info-surface text-tone-info-text w-fit rounded-xl p-2.5">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-semibold">Company Holiday Catalog</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {isPayrollActive
                    ? "Global and workspace-specific holidays synchronized with payroll and vacation deductions."
                    : "Global and workspace-specific holidays synchronized with vacation leave deductions."}
                </p>
              </div>
              <Button variant="outline" asChild className="w-full justify-between">
                <a href="/admin/calendars?tab=holidays">
                  Manage Holidays <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </GlassCard>

            {isPayrollActive && (
              <GlassCard delay={0.1} className="flex flex-col justify-between space-y-4 p-6">
                <div>
                  <div className="bg-tone-success-surface text-tone-success-text w-fit rounded-xl p-2.5">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold">Payroll Work Calendar</h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Authoritative monthly visual grid with standard workdays, weekends, and holiday
                    designations.
                  </p>
                </div>
                <Button variant="outline" asChild className="w-full justify-between">
                  <a href="/admin/payroll/calendar">
                    Open Payroll Calendar <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </GlassCard>
            )}
          </div>
        </TabsContent>

        {/* Tab 4: System & Environment */}
        <TabsContent
          value="system"
          forceMount
          className={activeTab === "system" ? "block" : "hidden"}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <GlassCard delay={0} className="space-y-4 p-6">
              <div className="flex items-center gap-2 border-b pb-3">
                <ShieldCheck className="text-primary h-5 w-5" />
                <h3 className="text-base font-semibold">Operational Environment</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div className="border-border/50 flex items-center justify-between border-b py-1.5">
                  <span className="text-muted-foreground text-xs">Authoritative Timezone:</span>
                  <span className="font-mono text-xs font-semibold">Europe/Tirane</span>
                </div>
                <div className="border-border/50 flex items-center justify-between border-b py-1.5">
                  <span className="text-muted-foreground text-xs">Monthly Approval Cut-off:</span>
                  <span className="text-foreground text-xs font-semibold">
                    00:00 on the 2nd of M+1
                  </span>
                </div>
                <div className="border-border/50 flex items-center justify-between border-b py-1.5">
                  <span className="text-muted-foreground text-xs">Authentication & Security:</span>
                  <span className="text-tone-success-text flex items-center gap-1 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Enforced Server-Side
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-xs">Reference Cache:</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    Enabled (dashboard_reference)
                  </span>
                </div>
              </div>
            </GlassCard>

            <GlassCard delay={0.05} className="flex flex-col justify-between space-y-4 p-6">
              <div>
                <div className="flex items-center gap-2 border-b pb-3">
                  <Info className="text-tone-info-text h-5 w-5" />
                  <h3 className="text-base font-semibold">Related Administration</h3>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  Access audit logs, user management, and plugin modules to adjust deeper system
                  parameters.
                </p>

                <div className="mt-4 space-y-2">
                  <Button variant="outline" size="sm" asChild className="w-full justify-between">
                    <a href="/admin/users">
                      User Accounts & Roles <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="w-full justify-between">
                    <a href="/admin/plugins">
                      Plugin Architecture <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="w-full justify-between">
                    <a href="/admin/audit-logs">
                      Security & Audit Logs <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="bg-surface-sunken/40 border-border/60 text-muted-foreground rounded-lg border p-3 text-xs">
                All configuration changes are recorded in the system audit log.
              </div>
            </GlassCard>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};
