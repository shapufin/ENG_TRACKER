/**
 * PayrollConfigurationForm — the "Organization & Payroll Defaults" card on
 * PayrollSettingsPage. Extracted so the page component stays an orchestrator
 * (state/queries/mutation) instead of one 500+ line render function.
 */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/common/forms/SwitchField";
import {
  Building2,
  Calculator,
  Clock,
  FileText,
  Receipt,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChoiceOption, ConfigurationChoices, PayrollConfiguration } from "../types";

const BOOLEAN_FIELDS = [
  ["overtime_is_taxable", "Overtime is subject to income tax"],
  ["standby_is_taxable", "Standby is subject to income tax"],
  ["overtime_is_contribution_bearing", "Overtime is subject to social/health contributions"],
  ["standby_is_contribution_bearing", "Standby is subject to social/health contributions"],
  ["only_approved_entries", "Only include approved records in payroll"],
  ["require_tl_closed_before_finalize", "Require team-leader approval before finalizing payroll"],
] as const;

const DEFAULT_TAX_PROFILE_CHOICES: ChoiceOption[] = [
  { value: "standard", label: "Standard employee" },
  { value: "category_6", label: "Category 6" },
  { value: "category_7", label: "Category 7" },
];

const DEFAULT_COUNTRY_CHOICES: ChoiceOption[] = [{ value: "AL", label: "Albania" }];

const VALIDATION_STATUS_CHOICES: ChoiceOption[] = [
  { value: "reference", label: "Reference (unofficial reference values)" },
  { value: "verified", label: "Verified (cross-checked with accounting)" },
  { value: "official", label: "Official (statutory gazette)" },
];

/** A titled card representing a group of related fields inside the configuration form. */
const FormSection: React.FC<{
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}> = ({ title, description, icon: Icon, children }) => {
  const id = React.useId();
  return (
    <section aria-labelledby={id}>
      <GlassCard className="p-6">
        <div className="mb-4">
          <h3 id={id} className="text-foreground flex items-center gap-2 text-base font-semibold">
            {Icon && <Icon className="text-primary h-4 w-4" aria-hidden="true" />}
            {title}
          </h3>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        {children}
      </GlassCard>
    </section>
  );
};

interface PayrollConfigurationFormProps {
  form: Partial<PayrollConfiguration>;
  choices: ConfigurationChoices | undefined;
  canConfigurePayroll: boolean;
  invalidWeekdayRate: boolean;
  invalidWeekendRate: boolean;
  onFieldChange: (key: keyof PayrollConfiguration, value: string) => void;
  onSwitchChange: (key: keyof PayrollConfiguration, checked: boolean) => void;
}

export const PayrollConfigurationForm: React.FC<PayrollConfigurationFormProps> = ({
  form,
  choices,
  canConfigurePayroll,
  invalidWeekdayRate,
  invalidWeekendRate,
  onFieldChange,
  onSwitchChange,
}) => (
  <div className="mb-6 space-y-6">
    <SectionHeading eyebrow="DEFAULTS" title="Organization & Payroll Defaults" />
    <FormSection
      title="Organization"
      description="Company identity, reporting currency, and payroll jurisdiction."
      icon={Building2}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="org">Organization Name</Label>
          <Input
            id="org"
            value={form.organization_name ?? ""}
            onChange={(e) => onFieldChange("organization_name", e.target.value)}
            disabled={!canConfigurePayroll}
          />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={form.currency ?? "ALL"}
            onValueChange={(v) => onFieldChange("currency", v)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="currency">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.currency ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="country">Payroll country</Label>
          <Select
            value={form.country ?? "AL"}
            onValueChange={(value) => onFieldChange("country", value)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="country">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.country ?? DEFAULT_COUNTRY_CHOICES).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormSection>

    <FormSection
      title="Standby rates"
      description="Hourly compensation rates applied during scheduled standby duty windows."
      icon={Clock}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="weekday-standby-rate">Weekday Standby Rate (Lek/hour)</Label>
          <Input
            id="weekday-standby-rate"
            type="number"
            value={form.weekday_standby_hourly_rate ?? "0"}
            onChange={(e) => onFieldChange("weekday_standby_hourly_rate", e.target.value)}
            disabled={!canConfigurePayroll}
          />
          {invalidWeekdayRate && (
            <p className="text-destructive mt-1 text-xs">Weekday rate cannot be negative.</p>
          )}
        </div>
        <div>
          <Label htmlFor="weekend-standby-rate">Weekend Standby Rate (Lek/hour)</Label>
          <Input
            id="weekend-standby-rate"
            type="number"
            value={form.weekend_standby_hourly_rate ?? "0"}
            onChange={(e) => onFieldChange("weekend_standby_hourly_rate", e.target.value)}
            disabled={!canConfigurePayroll}
          />
          {invalidWeekendRate && (
            <p className="text-destructive mt-1 text-xs">Weekend rate cannot be negative.</p>
          )}
        </div>
      </div>
    </FormSection>

    <FormSection
      title="Rounding & working hours"
      description="Rules for decimal precision, rounding algorithms, and working hour denominators."
      icon={Calculator}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="rounding">Rounding Mode</Label>
          <Select
            value={form.rounding_mode ?? "half_up"}
            onValueChange={(v) => onFieldChange("rounding_mode", v)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="rounding">
              <SelectValue placeholder="Select rounding mode" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.rounding_mode ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">
            How final amounts are rounded to the configured precision.
          </p>
        </div>
        <div>
          <Label htmlFor="rounding-precision">Decimal Places for Rounding</Label>
          <Input
            id="rounding-precision"
            type="number"
            min={0}
            max={4}
            value={form.rounding_precision ?? 0}
            onChange={(e) => onFieldChange("rounding_precision", e.target.value)}
            disabled={!canConfigurePayroll}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Decimal places for final amounts. 0 = whole Lek.
          </p>
        </div>
        <div>
          <Label htmlFor="hours-strategy">Monthly Working Hours Basis</Label>
          <Select
            value={form.monthly_hours_strategy ?? "fixed_174"}
            onValueChange={(v) => onFieldChange("monthly_hours_strategy", v)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="hours-strategy">
              <SelectValue placeholder="Select hours strategy" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.monthly_hours_strategy ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">
            Determines the base hourly rate: gross_wage / monthly_hours.
          </p>
        </div>
        <div>
          <Label htmlFor="fallback-cat">
            Default Overtime Category (when hours have no start/end time)
          </Label>
          <Select
            value={form.missing_timestamp_fallback_category ?? "weekday_day"}
            onValueChange={(v) => onFieldChange("missing_timestamp_fallback_category", v)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="fallback-cat">
              <SelectValue placeholder="Select fallback category" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.missing_timestamp_fallback_category ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">
            Category used when overtime has no start/end time.
          </p>
        </div>
      </div>
    </FormSection>

    <FormSection
      title="Tax & rules reference"
      description="Statutory profile defaults, standard daily hours, and audit citation details."
      icon={FileText}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="default-tax-profile">Default Tax Profile</Label>
          <Select
            value={form.default_tax_profile ?? "standard"}
            onValueChange={(value) => onFieldChange("default_tax_profile", value)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="default-tax-profile">
              <SelectValue placeholder="Select tax profile" />
            </SelectTrigger>
            <SelectContent>
              {(choices?.default_tax_profile ?? DEFAULT_TAX_PROFILE_CHOICES).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">
            Used when an employee has no separate tax profile.
          </p>
        </div>
        <div>
          <Label htmlFor="default-workday-hours">Standard Workday Hours</Label>
          <Input
            id="default-workday-hours"
            type="number"
            min="0"
            step="0.25"
            value={form.default_workday_hours ?? "8"}
            onChange={(e) => onFieldChange("default_workday_hours", e.target.value)}
            disabled={!canConfigurePayroll}
          />
        </div>
        <div>
          <Label htmlFor="rules-source-label">Source Reference Label</Label>
          <Input
            id="rules-source-label"
            value={form.rules_source_label ?? ""}
            onChange={(e) => onFieldChange("rules_source_label", e.target.value)}
            disabled={!canConfigurePayroll}
            placeholder="Example: Official guidance 2026"
          />
        </div>
        <div>
          <Label htmlFor="rules-validation-status">Validation Status</Label>
          <Select
            value={form.rules_validation_status ?? "reference"}
            onValueChange={(value) => onFieldChange("rules_validation_status", value)}
            disabled={!canConfigurePayroll}
          >
            <SelectTrigger id="rules-validation-status">
              <SelectValue placeholder="Select validation status" />
            </SelectTrigger>
            <SelectContent>
              {VALIDATION_STATUS_CHOICES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">
            Authority level of current rule set configuration.
          </p>
        </div>
      </div>
    </FormSection>

    <FormSection
      title="Calculation switches"
      description="Policy rules for taxable items, contribution assessments, and approval gates."
      icon={SlidersHorizontal}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BOOLEAN_FIELDS.map(([key, label]) => (
          <div key={key} className="border-border/50 bg-muted/20 rounded-lg border p-3">
            <SwitchField
              id={`payroll-${key}`}
              label={label}
              description="Applied when payroll calculations are generated."
              checked={Boolean(form[key])}
              onCheckedChange={(checked) => onSwitchChange(key, checked)}
              disabled={!canConfigurePayroll}
            />
          </div>
        ))}
      </div>
    </FormSection>

    <FormSection
      title="Payslip"
      description="Custom footer text printed at the bottom of generated payslips."
      icon={Receipt}
    >
      <div>
        <Label htmlFor="footer">Payslip Footer</Label>
        <Input
          id="footer"
          value={form.payslip_footer ?? ""}
          onChange={(e) => onFieldChange("payslip_footer", e.target.value)}
          disabled={!canConfigurePayroll}
        />
      </div>
    </FormSection>
  </div>
);
