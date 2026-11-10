import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayrollCalculationInfoDialog } from "./PayrollCalculationInfoDialog";
import { POLICY_BANDS, bandOfHour, multiplierPercent, splitShift } from "./calculationInfo";

describe("calculationInfo", () => {
  it("prices every band like the company table", () => {
    const rows = (["day", "evening", "night"] as const).map((band) => [
      multiplierPercent(band, false, POLICY_BANDS),
      multiplierPercent(band, true, POLICY_BANDS),
    ]);
    expect(rows).toEqual([
      [125, 150],
      [145, 170],
      [175, 200],
    ]);
  });

  it("starts the evening at 19:00 and the night at 22:00", () => {
    expect(bandOfHour(18, POLICY_BANDS)).toBe("day");
    expect(bandOfHour(19, POLICY_BANDS)).toBe("evening");
    expect(bandOfHour(22, POLICY_BANDS)).toBe("night");
    expect(bandOfHour(5, POLICY_BANDS)).toBe("night");
    expect(bandOfHour(6, POLICY_BANDS)).toBe("day");
  });

  it("switches to the next day's pay after midnight", () => {
    const parts = splitShift(22, 4, false, true, POLICY_BANDS);
    expect(parts.map((p) => [p.weekendOrHoliday, p.hours, p.percent])).toEqual([
      [false, 2, 175],
      [true, 4, 200],
    ]);
  });
});

describe("PayrollCalculationInfoDialog", () => {
  it("opens the modal with the policy table", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PayrollCalculationInfoDialog />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Calculation information" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Overtime pay by time of day")).toBeInTheDocument();
    expect(within(dialog).getByText("145%")).toBeInTheDocument();
    expect(within(dialog).getByText("200%")).toBeInTheDocument();
  });
});
