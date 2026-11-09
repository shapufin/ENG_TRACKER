/**
 * Pure helpers behind the "Calculation information" modal. They mirror the
 * backend slicing in `plugins/payroll/services/overtime_bands.py` for whole
 * hours (used for worked examples only; payroll itself is always computed
 * server-side).
 */
import type { PayrollRuleSet } from "../types";

export interface CalculationBands {
  otPremium: number;
  weekendHolidayPremium: number;
  eveningPremium: number;
  nightPremium: number;
  eveningStartHour: number;
  nightStartHour: number;
  nightEndHour: number;
}

export type BandId = "day" | "evening" | "night";

/** Company overtime policy; shown when no banded rule set is available. */
export const POLICY_BANDS: CalculationBands = {
  otPremium: 0.25,
  weekendHolidayPremium: 0.25,
  eveningPremium: 0.2,
  nightPremium: 0.5,
  eveningStartHour: 19,
  nightStartHour: 22,
  nightEndHour: 6,
};

/** The rule set's band settings, or null when it prices overtime by category. */
export function bandsFromRuleSet(
  ruleSet: PayrollRuleSet | null | undefined
): CalculationBands | null {
  if (!ruleSet || ruleSet.overtime_pricing !== "banded") return null;
  return {
    otPremium: Number(ruleSet.ot_premium),
    weekendHolidayPremium: Number(ruleSet.weekend_holiday_premium),
    eveningPremium: Number(ruleSet.evening_premium),
    nightPremium: Number(ruleSet.night_premium),
    eveningStartHour: ruleSet.evening_start_hour,
    nightStartHour: ruleSet.night_start_hour,
    nightEndHour: ruleSet.night_end_hour,
  };
}

export function bandOfHour(hour: number, bands: CalculationBands): BandId {
  const h = ((hour % 24) + 24) % 24;
  if (h >= bands.nightStartHour || h < bands.nightEndHour) return "night";
  if (h >= bands.eveningStartHour) return "evening";
  return "day";
}

function bandPremium(band: BandId, bands: CalculationBands): number {
  if (band === "evening") return bands.eveningPremium;
  if (band === "night") return bands.nightPremium;
  return 0;
}

/** Whole-percent multiplier: 1 + overtime + weekend/holiday + band premium. */
export function multiplierPercent(
  band: BandId,
  weekendOrHoliday: boolean,
  bands: CalculationBands
): number {
  const factor =
    1 +
    bands.otPremium +
    (weekendOrHoliday ? bands.weekendHolidayPremium : 0) +
    bandPremium(band, bands);
  return Math.round(factor * 100);
}

export function formatHour(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, "0")}:00`;
}

export interface ShiftPart {
  band: BandId;
  weekendOrHoliday: boolean;
  hours: number;
  percent: number;
}

/**
 * Split a whole-hour shift into priced parts. Hours after midnight belong to
 * the next calendar day, so `nextDayWeekendOrHoliday` applies to them.
 * `endHour <= startHour` wraps past midnight.
 */
export function splitShift(
  startHour: number,
  endHour: number,
  weekendOrHoliday: boolean,
  nextDayWeekendOrHoliday: boolean,
  bands: CalculationBands
): ShiftPart[] {
  const finish = endHour <= startHour ? endHour + 24 : endHour;
  const parts: ShiftPart[] = [];
  for (let hour = startHour; hour < finish; hour += 1) {
    const band = bandOfHour(hour, bands);
    const flag = hour >= 24 ? nextDayWeekendOrHoliday : weekendOrHoliday;
    const last = parts[parts.length - 1];
    if (last && last.band === band && last.weekendOrHoliday === flag) {
      last.hours += 1;
    } else {
      parts.push({
        band,
        weekendOrHoliday: flag,
        hours: 1,
        percent: multiplierPercent(band, flag, bands),
      });
    }
  }
  return parts;
}
