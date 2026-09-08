/**
 * Payroll plugin type definitions.
 */

export interface PayrollConfiguration {
  id: number;
  currency: string;
  country: string;
  default_tax_profile: string;
  rounding_mode: string;
  rounding_precision: number;
  weekday_standby_hourly_rate: string;
  weekend_standby_hourly_rate: string;
  monthly_hours_strategy: string;
  default_workday_hours: string;
  only_approved_entries: boolean;
  require_tl_closed_before_finalize: boolean;
  overtime_is_taxable: boolean;
  standby_is_taxable: boolean;
  overtime_is_contribution_bearing: boolean;
  standby_is_contribution_bearing: boolean;
  missing_timestamp_fallback_category: string;
  organization_name: string;
  payslip_footer: string;
  rules_source_label: string;
  rules_validation_status: string;
  created_at: string;
  updated_at: string;
}

export interface WageAssignment {
  id: number;
  user: number;
  user_name: string;
  user_full_name: string;
  gross_monthly_wage: string;
  effective_from: string;
  effective_to: string | null;
  note: string;
  is_active: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollTaxBracket {
  id: number;
  rule_set: number;
  lower_bound: string;
  upper_bound: string | null;
  rate: string;
  fixed_amount: string;
  order: number;
}

export interface PayrollContributionRate {
  id: number;
  rule_set: number;
  contribution_type: string;
  side: string;
  rate: string;
  cap: string | null;
  floor: string | null;
}

export interface PayrollOvertimeCategory {
  id: number;
  rule_set: number;
  code: string;
  multiplier: string;
  night_start_hour: number | null;
  night_end_hour: number | null;
  applies_weekend: boolean;
  applies_holiday: boolean;
  order: number;
}

export interface PayrollRuleSet {
  id: number;
  code: string;
  name: string;
  version: string;
  country: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  tax_profile: string;
  source: string;
  notes: string;
  validation_status: string;
  has_payroll_runs: boolean;
  effective_status: "current" | "upcoming" | "superseded" | "inactive";
  tax_brackets: PayrollTaxBracket[];
  contribution_rates: PayrollContributionRate[];
  overtime_categories: PayrollOvertimeCategory[];
  created_at: string;
  updated_at: string;
}

export interface PayrollRuleSetAtomicSavePayload {
  mode: "edit" | "version";
  expected_updated_at?: string;
  parent_fields: {
    code: string;
    name: string;
    version: string;
    country: string;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    tax_profile: string;
    source: string;
    notes: string;
    validation_status: string;
  };
  tax_brackets: Array<{
    id?: number;
    lower_bound: string;
    upper_bound: string | null;
    rate: string;
    fixed_amount: string;
    order: number;
  }>;
  contribution_rates: Array<{
    id?: number;
    contribution_type: string;
    side: string;
    rate: string;
    cap: string | null;
    floor: string | null;
  }>;
  overtime_categories: Array<{
    id?: number;
    code: string;
    multiplier: string;
    night_start_hour: number | null;
    night_end_hour: number | null;
    applies_weekend: boolean;
    applies_holiday: boolean;
    order: number;
  }>;
}

export interface PayrollWorkday {
  id: number;
  calendar: number;
  date: string;
  is_working_day: boolean;
  is_holiday: boolean;
  holiday_name: string;
  standard_hours: string;
  override_note: string;
}

export interface PayrollWorkCalendarMonthSummary {
  year: number;
  month: number;
  total_days: number;
  working_days: number;
  holiday_count: number;
  standard_hours: string;
  holidays: Array<{ date: string; name: string }>;
}

export interface PayrollWorkCalendar {
  id: number;
  country: string;
  year: number;
  is_active: boolean;
  source: string;
  workdays: PayrollWorkday[];
  workday_count: number;
  working_day_count: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollLine {
  id: number;
  user: number;
  user_name: string;
  user_full_name: string;
  run: number;
  wage_assignment: number | null;
  gross_monthly_wage: string;
  monthly_working_days: number;
  monthly_standard_hours: string;
  overtime_hours: string;
  overtime_amount: string;
  standby_hours: string;
  standby_amount: string;
  total_gross: string;
  taxable_base: string;
  contribution_base: string;
  employee_social: string;
  employee_health: string;
  income_tax: string;
  total_employee_deductions: string;
  net_pay: string;
  employer_social: string;
  employer_health: string;
  total_employer_cost: string;
  overtime_breakdown: {
    categories: Array<{
      code: string;
      hours: string;
      multiplier: string;
      amount: string;
    }>;
  };
  carryover_breakdown?: {
    carried_over?: Array<{
      from_period: string;
      requested_period: string;
      resolved_period: string;
      resolution_reason: string;
      work_dates: string[];
      overtime_hours: string;
      overtime_amount: string;
      standby_hours: string;
      standby_amount: string;
    }>;
  };
  calculation_trace: Record<string, unknown>;
  warnings: string[];
  rule_set_version: string;
  created_at: string;
  updated_at: string;
}

export interface ClosureStatus {
  period: string;
  all_closed: boolean;
  total_users: number;
  closed_users: number;
  unclosed_users: Array<{ id: number; username: string }>;
  entries_without_source_closure: Array<{
    source_kind: string;
    source_id: number;
    user_id: number;
  }>;
  requires_tl_closed_before_finalize: boolean;
}

export interface PayrollRun {
  id: number;
  year: number;
  month: number;
  status: "draft" | "finalized" | "cancelled";
  rule_set: number;
  rule_set_name: string;
  line_count: number;
  created_by: number | null;
  created_by_name: string | null;
  finalized_by: number | null;
  finalized_by_name: string | null;
  finalized_at: string | null;
  configuration_snapshot: Record<string, unknown>;
  totals: {
    total_gross: string;
    total_deductions: string;
    total_net: string;
    total_employer_cost: string;
    total_overtime: string;
    total_standby: string;
    line_count: number;
  };
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollPreviewResult {
  user_id: number;
  user_display: string;
  gross_monthly_wage: string;
  overtime_hours: string;
  overtime_amount: string;
  standby_hours: string;
  standby_amount: string;
  total_gross: string;
  employee_social: string;
  employee_health: string;
  income_tax: string;
  total_employee_deductions: string;
  net_pay: string;
  employer_social: string;
  employer_health: string;
  total_employer_cost: string;
  warnings: string[];
  carryover_breakdown: { carried_over?: Array<Record<string, unknown>> };
  rule_set_code: string;
}

export interface PayrollRunCreatePayload {
  year: number;
  month: number;
  user_ids?: number[];
  notes?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ConfigurationChoices {
  currency: ChoiceOption[];
  country?: ChoiceOption[];
  default_tax_profile?: ChoiceOption[];
  rounding_mode: ChoiceOption[];
  monthly_hours_strategy: ChoiceOption[];
  missing_timestamp_fallback_category: ChoiceOption[];
}

export interface EligibleUser {
  id: number;
  username: string;
  full_name: string;
  has_active_wage: boolean;
  current_wage: string | null;
}

export interface WageBulkItem {
  user: number;
  gross_monthly_wage: string;
  effective_from: string;
  effective_to?: string | null;
  note?: string;
  is_active?: boolean;
}

export interface WageBulkCreateResult {
  created: number;
  errors: Array<{ index: number; errors: Record<string, unknown> }>;
}
