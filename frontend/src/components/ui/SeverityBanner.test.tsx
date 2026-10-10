import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeverityBanner, SEVERITY_META, type Severity } from "./SeverityBanner";
import { toneSurfaceClass } from "./tone";

const pager = { index: 0, total: 3, onPrev: () => {}, onNext: () => {} };

describe("SeverityBanner", () => {
  it.each(["critical", "warning", "info", "positive"] as Severity[])(
    "uses the tone for each severity (%s)",
    (severity) => {
      render(<SeverityBanner severity={severity} title="T" />);
      const banner = screen.getByTestId("severity-banner");
      for (const cls of toneSurfaceClass[SEVERITY_META[severity].tone].split(" ")) {
        expect(banner).toHaveClass(cls);
      }
      expect(screen.getByText(SEVERITY_META[severity].label)).toBeInTheDocument();
    }
  );

  it('shows "n of m" and severity counts when stacked', () => {
    render(
      <SeverityBanner
        severity="critical"
        title="T"
        pager={pager}
        counts={{ critical: 2, warning: 1 }}
      />
    );
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText("2 critical \u00b7 1 warning")).toBeInTheDocument();
  });

  it("renders deck layers only when total > 1", () => {
    const { rerender } = render(<SeverityBanner severity="info" title="T" pager={pager} />);
    expect(screen.getAllByTestId("severity-deck-layer")).toHaveLength(2);
    rerender(<SeverityBanner severity="info" title="T" pager={{ ...pager, total: 1 }} />);
    expect(screen.queryAllByTestId("severity-deck-layer")).toHaveLength(0);
  });

  it("dismiss button is labelled", () => {
    render(<SeverityBanner severity="info" title="T" onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Dismiss insight" })).toBeInTheDocument();
  });
});
