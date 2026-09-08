import React, { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollService } from "../services/payrollService";
import { handleApiError } from "@/lib/error-handler";
import {
  fractionToPercent,
  parseOptionalDecimal,
  percentToFraction,
} from "../utils/ruleSetFormUtils";
import type { PayrollRuleSet, PayrollRuleSetAtomicSavePayload } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PayrollRuleSet | null;
  mode: "edit" | "version";
  onSaved: () => void;
}

type ParentForm = PayrollRuleSetAtomicSavePayload["parent_fields"];
type BracketForm = PayrollRuleSetAtomicSavePayload["tax_brackets"][number];
type ContributionForm = PayrollRuleSetAtomicSavePayload["contribution_rates"][number];
type OvertimeForm = PayrollRuleSetAtomicSavePayload["overtime_categories"][number];

const OT_CATEGORY_OPTIONS = [
  { value: "weekday_day", label: "Weekday — Daytime" },
  { value: "weekday_night", label: "Weekday — Night" },
  { value: "weekend_day", label: "Weekend — Daytime" },
  { value: "weekend_night", label: "Weekend — Night" },
  { value: "holiday", label: "Public Holiday" },
];
const CONTRIBUTION_TYPE_OPTIONS = [
  { value: "social", label: "Social security" },
  { value: "health", label: "Health insurance" },
];
const CONTRIBUTION_SIDE_OPTIONS = [
  { value: "employee", label: "Employee deduction (from salary)" },
  { value: "employer", label: "Employer contribution (on top of salary)" },
];
const TAX_PROFILE_OPTIONS = [
  { value: "standard", label: "Standard employee" },
  { value: "category_6", label: "Category 6 (reserved)" },
  { value: "category_7", label: "Category 7 (reserved)" },
];
const COUNTRY_OPTIONS = [{ value: "AL", label: "Albania" }];
const VALIDATION_STATUS_OPTIONS = [
  { value: "reference", label: "Reference — unverified defaults" },
  { value: "verified", label: "Verified — checked against source" },
  { value: "official", label: "Official — confirmed source" },
];

const getBackendErrorMessage = (error: unknown): string | null => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  const fields = Object.entries(payload)
    .filter(([, value]) => value)
    .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  return fields.length > 0 ? fields.join("; ") : null;
};

const makeParent = (source: PayrollRuleSet, mode: Props["mode"]): ParentForm => ({
  code: mode === "edit" ? source.code : "",
  name: source.name,
  version: mode === "edit" ? source.version : "",
  country: source.country,
  effective_from: mode === "edit" ? source.effective_from : "",
  effective_to: mode === "edit" ? source.effective_to : null,
  is_active: source.is_active,
  tax_profile: source.tax_profile,
  source: source.source,
  notes: source.notes,
  validation_status: source.validation_status,
});

const makeBrackets = (source: PayrollRuleSet): BracketForm[] =>
  source.tax_brackets.map((bracket) => ({
    id: bracket.id,
    lower_bound: bracket.lower_bound,
    upper_bound: bracket.upper_bound,
    rate: fractionToPercent(bracket.rate),
    fixed_amount: bracket.fixed_amount,
    order: bracket.order,
  }));

const makeContributions = (source: PayrollRuleSet): ContributionForm[] =>
  source.contribution_rates.map((rate) => ({
    id: rate.id,
    contribution_type: rate.contribution_type,
    side: rate.side,
    rate: fractionToPercent(rate.rate),
    cap: rate.cap,
    floor: rate.floor,
  }));

const makeOvertimeCategories = (source: PayrollRuleSet): OvertimeForm[] =>
  source.overtime_categories.map((category) => ({
    id: category.id,
    code: category.code,
    multiplier: fractionToPercent(category.multiplier),
    night_start_hour: category.night_start_hour,
    night_end_hour: category.night_end_hour,
    applies_weekend: category.applies_weekend,
    applies_holiday: category.applies_holiday,
    order: category.order,
  }));

const defaultBracket = (): BracketForm => ({
  lower_bound: "0",
  upper_bound: null,
  rate: "0",
  fixed_amount: "0",
  order: 0,
});
const defaultContribution = (): ContributionForm => ({
  contribution_type: "social",
  side: "employee",
  rate: "0",
  cap: null,
  floor: null,
});
const defaultOvertimeCategory = (): OvertimeForm => ({
  code: "weekday_day",
  multiplier: "100",
  night_start_hour: null,
  night_end_hour: null,
  applies_weekend: false,
  applies_holiday: false,
  order: 0,
});

const numberValue = (value: string | null): number | null =>
  value === null || value.trim() === "" ? null : Number(value);

const validateParent = (form: ParentForm): string | null => {
  if (!form.code.trim() || !form.name.trim() || !form.version.trim() || !form.effective_from) {
    return "Name, code, version, and effective date are required.";
  }
  if (form.effective_to && form.effective_to < form.effective_from) {
    return "The end date must be on or after the start date.";
  }
  return null;
};

const validateBrackets = (brackets: BracketForm[]): string | null => {
  const ordered = [...brackets].sort((a, b) => Number(a.lower_bound) - Number(b.lower_bound));
  for (const bracket of ordered) {
    if (
      parseOptionalDecimal(bracket.lower_bound) === null ||
      parseOptionalDecimal(bracket.rate) === null ||
      parseOptionalDecimal(bracket.fixed_amount) === null
    ) {
      return "Each tax bracket needs valid income limits, tax rate, and fixed amount values.";
    }
    if (
      Number(bracket.lower_bound) < 0 ||
      Number(bracket.fixed_amount) < 0 ||
      Number(bracket.rate) < 0 ||
      Number(bracket.rate) > 100
    ) {
      return "Tax amounts cannot be negative and tax rates must be between 0% and 100%.";
    }
    if (bracket.upper_bound !== null && bracket.upper_bound !== "") {
      if (
        parseOptionalDecimal(bracket.upper_bound) === null ||
        Number(bracket.upper_bound) <= Number(bracket.lower_bound)
      ) {
        return "Each tax bracket upper limit must be greater than its lower limit.";
      }
    }
  }
  if (
    ordered.length > 0 &&
    (Number(ordered[0].lower_bound) !== 0 ||
      ordered.filter((bracket) => bracket.upper_bound === null || bracket.upper_bound === "")
        .length !== 1 ||
      (ordered[ordered.length - 1].upper_bound !== null &&
        ordered[ordered.length - 1].upper_bound !== ""))
  ) {
    return "Tax brackets must start at Lek 0 and end with exactly one unlimited bracket.";
  }
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (Number(ordered[index].upper_bound) !== Number(ordered[index + 1].lower_bound)) {
      return "Tax brackets must have no gaps between one income range and the next.";
    }
  }
  return null;
};

const validateContributions = (contributions: ContributionForm[]): string | null => {
  const keys = new Set<string>();
  for (const contribution of contributions) {
    if (
      parseOptionalDecimal(contribution.rate) === null ||
      Number(contribution.rate) < 0 ||
      Number(contribution.rate) > 100
    ) {
      return "Contribution rates must be between 0% and 100%.";
    }
    const key = `${contribution.contribution_type}:${contribution.side}`;
    if (keys.has(key))
      return "Each contribution type can have only one employee and one employer rule.";
    keys.add(key);
    if (
      (contribution.cap !== null && parseOptionalDecimal(contribution.cap) === null) ||
      (contribution.floor !== null && parseOptionalDecimal(contribution.floor) === null)
    ) {
      return "Contribution limits must be valid non-negative Lek amounts.";
    }
    const cap = numberValue(contribution.cap);
    const floor = numberValue(contribution.floor);
    if (
      (cap !== null && cap < 0) ||
      (floor !== null && floor < 0) ||
      (cap !== null && floor !== null && cap < floor)
    ) {
      return "A contribution maximum cannot be lower than its minimum or below zero.";
    }
  }
  return null;
};

const validateOvertimeCategories = (categories: OvertimeForm[]): string | null => {
  const codes = new Set<string>();
  for (const category of categories) {
    if (parseOptionalDecimal(category.multiplier) === null || Number(category.multiplier) < 0) {
      return "Overtime pay percentages must be zero or greater.";
    }
    if (codes.has(category.code)) return "Each overtime category can appear only once.";
    codes.add(category.code);
    for (const hour of [category.night_start_hour, category.night_end_hour]) {
      if (hour !== null && (hour < 0 || hour > 23 || !Number.isInteger(hour))) {
        return "Night start and end times must be whole hours from 0 to 23.";
      }
    }
  }
  return null;
};

export const PayrollRuleSetEditorDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  source,
  mode,
  onSaved,
}) => {
  const [form, setForm] = useState<ParentForm | null>(() =>
    source ? makeParent(source, mode) : null
  );
  const [brackets, setBrackets] = useState<BracketForm[]>(() =>
    source ? makeBrackets(source) : []
  );
  const [contributions, setContributions] = useState<ContributionForm[]>(() =>
    source ? makeContributions(source) : []
  );
  const [overtimeCategories, setOvertimeCategories] = useState<OvertimeForm[]>(() =>
    source ? makeOvertimeCategories(source) : []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const updateParent = <K extends keyof ParentForm>(field: K, value: ParentForm[K]) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const validate = (): string | null => {
    if (!form) return "The rule set is not ready to edit.";
    return (
      validateParent(form) ??
      validateBrackets(brackets) ??
      validateContributions(contributions) ??
      validateOvertimeCategories(overtimeCategories)
    );
  };

  const buildPayload = (): PayrollRuleSetAtomicSavePayload => {
    const orderedBrackets = [...brackets].sort(
      (a, b) => Number(a.lower_bound) - Number(b.lower_bound)
    );
    return {
      mode,
      expected_updated_at: source?.updated_at,
      parent_fields: form as ParentForm,
      tax_brackets: orderedBrackets.map((bracket, order) => ({
        ...(mode === "edit" && bracket.id ? { id: bracket.id } : {}),
        lower_bound: bracket.lower_bound,
        upper_bound: bracket.upper_bound === "" ? null : bracket.upper_bound,
        rate: percentToFraction(bracket.rate),
        fixed_amount: bracket.fixed_amount,
        order,
      })),
      contribution_rates: contributions.map((contribution) => ({
        ...(mode === "edit" && contribution.id ? { id: contribution.id } : {}),
        contribution_type: contribution.contribution_type,
        side: contribution.side,
        rate: percentToFraction(contribution.rate),
        cap: parseOptionalDecimal(contribution.cap ?? ""),
        floor: parseOptionalDecimal(contribution.floor ?? ""),
      })),
      overtime_categories: overtimeCategories.map((category, order) => ({
        ...(mode === "edit" && category.id ? { id: category.id } : {}),
        code: category.code,
        multiplier: percentToFraction(category.multiplier),
        night_start_hour: category.night_start_hour,
        night_end_hour: category.night_end_hour,
        applies_weekend: category.applies_weekend,
        applies_holiday: category.applies_holiday,
        order,
      })),
    };
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError || !source) {
      setError(validationError ?? "The rule set is not ready to edit.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await payrollService.saveRuleSet(source.id, buildPayload());
      onSaved();
      onOpenChange(false);
    } catch (cause) {
      const backendMessage = getBackendErrorMessage(cause);
      setError(backendMessage ?? "Could not save the payroll rule set.");
      handleApiError(cause);
    } finally {
      setIsSaving(false);
    }
  };

  const moveCategory = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= overtimeCategories.length) return;
    setOvertimeCategories((items) => {
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        mode === "edit"
          ? `Edit ${source?.name ?? "Payroll calculation"}`
          : `Create new version from ${source?.name ?? "Payroll calculation"}`
      }
      onSubmit={submit}
      isSubmitting={isSaving}
      submitLabel={mode === "edit" ? "Save calculation" : "Create version"}
      contentClassName="sm:max-w-4xl"
    >
      <p className="text-sm text-muted-foreground">
        {mode === "edit"
          ? "Changes affect future payroll calculations only. Historical payroll runs remain unchanged."
          : "This creates a new effective-dated calculation and keeps the original version unchanged. Use a unique code and version, and choose an effective date that does not duplicate another active calculation."}
      </p>
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {form && (
        <>
          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <div>
              <h3 className="font-semibold">Calculation Name & Version</h3>
              <p className="text-sm text-muted-foreground">
                Name this calculation so another administrator can recognize it later.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(
                [
                  ["name", "Calculation name", "Example: Albania 2026 payroll"],
                  ["code", "Short Code (unique ID)", "Unique identifier for this calculation"],
                  ["version", "Version", "Example: 2.0"],
                  ["source", "Rules source", "Example: Official guidance 2026"],
                ] as const
              ).map(([field, label, placeholder]) => (
                <div key={field}>
                  <Label htmlFor={`rule-${field}`}>{label}</Label>
                  <Input
                    id={`rule-${field}`}
                    value={form[field]}
                    placeholder={placeholder}
                    onChange={(event) => updateParent(field, event.target.value)}
                  />
                </div>
              ))}
              <div>
                <Label htmlFor="rule-effective-from">Effective from</Label>
                <Input
                  id="rule-effective-from"
                  type="date"
                  value={form.effective_from}
                  onChange={(event) => updateParent("effective_from", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rule-effective-to">Effective to (optional)</Label>
                <Input
                  id="rule-effective-to"
                  type="date"
                  value={form.effective_to ?? ""}
                  onChange={(event) => updateParent("effective_to", event.target.value || null)}
                />
              </div>
              <div>
                <Label htmlFor="rule-tax-profile">Tax profile</Label>
                <Select
                  value={form.tax_profile}
                  onValueChange={(value) => updateParent("tax_profile", value)}
                >
                  <SelectTrigger id="rule-tax-profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_PROFILE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-country">Country</Label>
                <Select
                  value={form.country}
                  onValueChange={(value) => updateParent("country", value)}
                >
                  <SelectTrigger id="rule-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-validation-status">Validation status</Label>
                <Select
                  value={form.validation_status}
                  onValueChange={(value) => updateParent("validation_status", value)}
                >
                  <SelectTrigger id="rule-validation-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALIDATION_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(checked) => updateParent("is_active", checked === true)}
                />
                Set as active for new payroll runs
              </label>
            </div>
            <div>
              <Label htmlFor="rule-notes">Internal Notes</Label>
              <Textarea
                id="rule-notes"
                value={form.notes}
                onChange={(event) => updateParent("notes", event.target.value)}
                placeholder="Explain the source or assumptions behind these values."
              />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Income Tax Brackets</h3>
                <p className="text-sm text-muted-foreground">
                  Enter income limits in Lek. Tax rates are percentages, for example 13 means 13%.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBrackets((items) => [...items, defaultBracket()])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add bracket
              </Button>
            </div>
            {brackets.map((bracket, index) => (
              <div
                key={bracket.id ?? `new-bracket-${index}`}
                className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 md:grid-cols-5"
              >
                <div>
                  <Label>From (Lek)</Label>
                  <Input
                    aria-label={`Tax bracket ${index + 1} lower income`}
                    type="number"
                    min="0"
                    value={bracket.lower_bound}
                    onChange={(event) =>
                      setBrackets((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, lower_bound: event.target.value } : item
                        )
                      )
                    }
                  />
                </div>
                <div>
                  <Label>To (Lek)</Label>
                  <Input
                    aria-label={`Tax bracket ${index + 1} upper income`}
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={bracket.upper_bound ?? ""}
                    onChange={(event) =>
                      setBrackets((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, upper_bound: event.target.value || null }
                            : item
                        )
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Tax rate (%)</Label>
                  <Input
                    aria-label={`Tax bracket ${index + 1} tax rate`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={bracket.rate}
                    onChange={(event) =>
                      setBrackets((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, rate: event.target.value } : item
                        )
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Fixed amount (Lek)</Label>
                  <Input
                    aria-label={`Tax bracket ${index + 1} fixed amount`}
                    type="number"
                    min="0"
                    value={bracket.fixed_amount}
                    onChange={(event) =>
                      setBrackets((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, fixed_amount: event.target.value } : item
                        )
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove tax bracket ${index + 1}`}
                  className="mt-5 text-destructive"
                  onClick={() =>
                    setBrackets((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              The last bracket should have no upper limit. Brackets must start at Lek 0 and have no
              gaps.
            </p>
          </section>

          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Social Security & Health Insurance</h3>
                <p className="text-sm text-muted-foreground">
                  Use percentages. A cap or floor limits the monthly income base, not the rate.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setContributions((items) => [...items, defaultContribution()])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add contribution
              </Button>
            </div>
            {contributions.map((contribution, index) => (
              <div
                key={contribution.id ?? `new-contribution-${index}`}
                className="space-y-3 rounded-md border border-border/60 p-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>Contribution type</Label>
                    <Select
                      value={contribution.contribution_type}
                      onValueChange={(value) =>
                        setContributions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, contribution_type: value } : item
                          )
                        )
                      }
                    >
                      <SelectTrigger aria-label={`Contribution ${index + 1} type`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRIBUTION_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Who pays</Label>
                    <Select
                      value={contribution.side}
                      onValueChange={(value) =>
                        setContributions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, side: value } : item
                          )
                        )
                      }
                    >
                      <SelectTrigger aria-label={`Contribution ${index + 1} payer`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRIBUTION_SIDE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Rate (%)</Label>
                    <Input
                      aria-label={`Contribution ${index + 1} rate`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={contribution.rate}
                      onChange={(event) =>
                        setContributions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, rate: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>Minimum base (Lek)</Label>
                    <Input
                      aria-label={`Contribution ${index + 1} minimum base`}
                      type="number"
                      min="0"
                      value={contribution.floor ?? ""}
                      placeholder="No minimum"
                      onChange={(event) =>
                        setContributions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, floor: event.target.value || null }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Maximum base (Lek)</Label>
                    <Input
                      aria-label={`Contribution ${index + 1} maximum base`}
                      type="number"
                      min="0"
                      value={contribution.cap ?? ""}
                      placeholder="No maximum"
                      onChange={(event) =>
                        setContributions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, cap: event.target.value || null }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove contribution ${index + 1}`}
                    className="mt-5 justify-self-start text-destructive"
                    onClick={() =>
                      setContributions((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Overtime Pay Categories</h3>
                <p className="text-sm text-muted-foreground">
                  125% means 1.25 times the normal hourly wage. Night hours are whole hours from 0
                  to 23.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setOvertimeCategories((items) => [...items, defaultOvertimeCategory()])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add category
              </Button>
            </div>
            {overtimeCategories.map((category, index) => (
              <div
                key={category.id ?? `new-category-${index}`}
                className="space-y-3 rounded-md border border-border/60 p-3"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>Category</Label>
                    <Select
                      value={category.code}
                      onValueChange={(value) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, code: value } : item
                          )
                        )
                      }
                    >
                      <SelectTrigger aria-label={`Overtime category ${index + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OT_CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Overtime pay (%)</Label>
                    <Input
                      aria-label={`Overtime category ${index + 1} pay percentage`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={category.multiplier}
                      onChange={(event) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, multiplier: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="flex items-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move overtime category ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveCategory(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move overtime category ${index + 1} down`}
                      disabled={index === overtimeCategories.length - 1}
                      onClick={() => moveCategory(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove overtime category ${index + 1}`}
                      className="text-destructive"
                      onClick={() =>
                        setOvertimeCategories((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label>Night starts at (0–23, optional)</Label>
                    <Input
                      aria-label={`Overtime category ${index + 1} night start`}
                      type="number"
                      min="0"
                      max="23"
                      value={category.night_start_hour ?? ""}
                      onChange={(event) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  night_start_hour:
                                    event.target.value === "" ? null : Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Night ends at (0–23, optional)</Label>
                    <Input
                      aria-label={`Overtime category ${index + 1} night end`}
                      type="number"
                      min="0"
                      max="23"
                      value={category.night_end_hour ?? ""}
                      onChange={(event) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  night_end_hour:
                                    event.target.value === "" ? null : Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={category.applies_weekend}
                      onCheckedChange={(checked) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, applies_weekend: checked === true }
                              : item
                          )
                        )
                      }
                    />{" "}
                    Applies on weekends
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={category.applies_holiday}
                      onCheckedChange={(checked) =>
                        setOvertimeCategories((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, applies_holiday: checked === true }
                              : item
                          )
                        )
                      }
                    />{" "}
                    Applies on public holidays
                  </label>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </FormDialog>
  );
};
