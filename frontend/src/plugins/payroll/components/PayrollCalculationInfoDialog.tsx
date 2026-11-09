/**
 * PayrollCalculationInfoDialog: "Calculation information" button + modal.
 * Explains how overtime is priced: the hourly-rate formula, the 24 h band
 * timeline, the percentage matrix (weekday vs Sunday/holiday) and worked
 * examples. Values come from the rule set when given/fetched, otherwise from
 * the company policy.
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Moon, Sun, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toneFillClass, toneSurfaceClass, toneTextClass, type Tone } from "@/components/ui/tone";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { payrollService } from "../services/payrollService";
import type { PayrollRuleSet } from "../types";
import {
  POLICY_BANDS,
  bandsFromRuleSet,
  formatHour,
  multiplierPercent,
  splitShift,
  type BandId,
  type CalculationBands,
} from "./calculationInfo";

const BAND_META: Record<BandId, { label: string; tone: Tone; Icon: typeof Sun }> = {
  day: { label: "Day", tone: "info", Icon: Sun },
  evening: { label: "Evening", tone: "warning", Icon: Sunset },
  night: { label: "Night", tone: "accent", Icon: Moon },
};

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

function bandWindow(band: BandId, b: CalculationBands): string {
  if (band === "day") return `${formatHour(b.nightEndHour)} - ${formatHour(b.eveningStartHour)}`;
  if (band === "evening")
    return `${formatHour(b.eveningStartHour)} - ${formatHour(b.nightStartHour)}`;
  return `${formatHour(b.nightStartHour)} - ${formatHour(b.nightEndHour)}`;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
    {children}
  </h3>
);

const DayTimeline: React.FC<{ bands: CalculationBands }> = ({ bands }) => {
  const segments: Array<{ band: BandId; from: number; to: number }> = [
    { band: "night", from: 0, to: bands.nightEndHour },
    { band: "day", from: bands.nightEndHour, to: bands.eveningStartHour },
    { band: "evening", from: bands.eveningStartHour, to: bands.nightStartHour },
    { band: "night", from: bands.nightStartHour, to: 24 },
  ];
  return (
    <div>
      <div
        role="img"
        aria-label={`24 hour day: night ${bandWindow("night", bands)}, day ${bandWindow("day", bands)}, evening ${bandWindow("evening", bands)}`}
        className="border-border flex h-3 overflow-hidden rounded-full border"
      >
        {segments.map((s) => (
          <div
            key={`${s.band}-${s.from}`}
            className={toneFillClass[BAND_META[s.band].tone]}
            style={{ width: `${((s.to - s.from) / 24) * 100}%` }}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
};

const ShiftExample: React.FC<{
  title: string;
  hint: string;
  start: number;
  end: number;
  weekend: boolean;
  nextWeekend: boolean;
  bands: CalculationBands;
}> = ({ title, hint, start, end, weekend, nextWeekend, bands }) => {
  const parts = splitShift(start, end, weekend, nextWeekend, bands);
  return (
    <div className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-foreground text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs">
          {formatHour(start)} - {formatHour(end)} · {hint}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {parts.map((p, i) => {
          const meta = BAND_META[p.band];
          return (
            <li
              key={`${p.band}-${i}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium",
                toneSurfaceClass[meta.tone]
              )}
            >
              <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {p.hours} h {meta.label.toLowerCase()}
              {p.weekendOrHoliday ? " (Sun/holiday)" : ""} × {p.percent}%
            </li>
          );
        })}
      </ul>
    </div>
  );
};

interface PayrollCalculationInfoDialogProps {
  /** A rule set already in hand (settings page). */
  ruleSet?: PayrollRuleSet | null;
  /** Fetch this rule set when opened (run pages). */
  ruleSetId?: number;
  className?: string;
}

export const PayrollCalculationInfoDialog: React.FC<PayrollCalculationInfoDialogProps> = ({
  ruleSet,
  ruleSetId,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const needsFetch = open && !ruleSet && ruleSetId !== undefined;
  const { data: fetched } = useQuery({
    queryKey: ["payroll-rule-sets", { active: undefined }],
    queryFn: () => payrollService.getRuleSets(),
    enabled: needsFetch,
  });
  const source = ruleSet ?? fetched?.find((rs) => rs.id === ruleSetId) ?? null;
  const fromRuleSet = bandsFromRuleSet(source);
  const bands = fromRuleSet ?? POLICY_BANDS;
  const legacy = source !== null && fromRuleSet === null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Calculator className="h-4 w-4" aria-hidden="true" />
        Calculation information
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Calculation information</DialogTitle>
            <DialogDescription>
              {source && !legacy
                ? `How overtime is priced in ${source.name} (v${source.version}).`
                : "How overtime is priced under the company policy."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {legacy && (
              <p
                role="note"
                className={cn("rounded-xl border p-3 text-sm", toneSurfaceClass.warning)}
              >
                {source?.name} prices overtime by fixed categories, not by time of day. The band
                table below is the company policy used by banded rule sets.
              </p>
            )}

            <section>
              <SectionTitle>Formula</SectionTitle>
              <div className="border-border bg-muted/40 rounded-xl border p-3 text-sm">
                <p className="text-foreground font-semibold">
                  Overtime pay = paid hours × hourly rate × multiplier
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Hourly rate = gross monthly wage ÷ standard monthly hours. Multiplier = 100% +{" "}
                  overtime {pct(bands.otPremium)} + Sunday/holiday{" "}
                  {pct(bands.weekendHolidayPremium)} + evening {pct(bands.eveningPremium)} or night{" "}
                  {pct(bands.nightPremium)}.
                </p>
              </div>
            </section>

            <section>
              <SectionTitle>The 24 hour day</SectionTitle>
              <DayTimeline bands={bands} />
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {(["day", "evening", "night"] as const).map((band) => {
                  const meta = BAND_META[band];
                  return (
                    <li
                      key={band}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-2 text-sm",
                        toneSurfaceClass[meta.tone]
                      )}
                    >
                      <meta.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="font-semibold">{meta.label}</span>
                      <span className="ml-auto text-xs tabular-nums">
                        {bandWindow(band, bands)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <SectionTitle>Overtime pay by time of day</SectionTitle>
              <div className="border-border overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TABLE_HEAD_ROW_CLASS}>
                      <th scope="col" className={TABLE_HEAD_CELL_CLASS}>
                        Time of day
                      </th>
                      <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>
                        Mon to Sat
                      </th>
                      <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>
                        Sunday / holiday
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["day", "evening", "night"] as const).map((band) => {
                      const meta = BAND_META[band];
                      return (
                        <tr key={band} className="border-border border-t">
                          <th scope="row" className="px-3 py-2 text-left font-medium">
                            <span className="flex items-center gap-2">
                              <meta.Icon
                                className={cn("h-4 w-4", toneTextClass[meta.tone])}
                                aria-hidden="true"
                              />
                              {meta.label}
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {bandWindow(band, bands)}
                              </span>
                            </span>
                          </th>
                          <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                            {multiplierPercent(band, false, bands)}%
                          </td>
                          <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                            {multiplierPercent(band, true, bands)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <SectionTitle>Worked examples</SectionTitle>
              <div className="space-y-2">
                <ShiftExample
                  title="Weekday evening"
                  hint="Monday"
                  start={18}
                  end={21}
                  weekend={false}
                  nextWeekend={false}
                  bands={bands}
                />
                <ShiftExample
                  title="Saturday night into Sunday"
                  hint="crosses midnight"
                  start={22}
                  end={4}
                  weekend={false}
                  nextWeekend={true}
                  bands={bands}
                />
              </div>
            </section>

            <section>
              <SectionTitle>Good to know</SectionTitle>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                <li>
                  An entry that crosses a time boundary is split by the clock, so each part is paid
                  at its own rate. Paid hours are shared out in proportion to the minutes in each
                  part.
                </li>
                <li>
                  Saturday is a normal day. Sundays and public holidays use the Sunday / holiday
                  column; after midnight the next day&apos;s type applies.
                </li>
                <li>
                  Entries that start in the same paid hour share that hour, so it is paid once.
                </li>
                <li>
                  Entries without a start and end time are paid at the day rate and flagged with a
                  warning.
                </li>
                <li>
                  Only logged overtime is priced here; standby is paid at its own hourly rate.
                </li>
              </ul>
            </section>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};
