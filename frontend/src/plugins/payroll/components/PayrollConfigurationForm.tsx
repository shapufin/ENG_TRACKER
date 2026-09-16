/**
 * PayrollConfigurationForm — the "Organization & Payroll Defaults" card on
 * PayrollSettingsPage. Extracted so the page component stays an orchestrator
 * (state/queries/mutation) instead of one 500+ line render function.
 */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/common/forms/SwitchField";
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
  <GlassCard className="mb-6 p-6">
    <h3 className="mb-4 text-lg font-semibold">Organization & Payroll Defaults</h3>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <p className="mt-1 text-xs text-destructive">Weekday rate cannot be negative.</p>
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
          <p className="mt-1 text-xs text-destructive">Weekend rate cannot be negative.</p>
        )}
      </div>
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
        <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
          Category used when overtime has no start/end time.
        </p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
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
        <p className="mt-1 text-xs text-muted-foreground">
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
        <Input
          id="rules-validation-status"
          value={form.rules_validation_status ?? ""}
          onChange={(e) => onFieldChange("rules_validation_status", e.target.value)}
          disabled={!canConfigurePayroll}
          placeholder="reference, verified, or official"
        />
      </div>
    </div>
    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
      {BOOLEAN_FIELDS.map(([key, label]) => (
        <SwitchField
          key={key}
          id={`payroll-${key}`}
          label={label}
          description="Applied when payroll calculations are generated."
          checked={Boolean(form[key])}
          onCheckedChange={(checked) => onSwitchChange(key, checked)}
          disabled={!canConfigurePayroll}
        />
      ))}
    </div>
    <div className="mt-4">
      <Label htmlFor="footer">Payslip Footer</Label>
      <Input
        id="footer"
        value={form.payslip_footer ?? ""}
        onChange={(e) => onFieldChange("payslip_footer", e.target.value)}
        disabled={!canConfigurePayroll}
      />
    </div>
  </GlassCard>
);
