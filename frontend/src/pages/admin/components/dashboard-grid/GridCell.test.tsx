import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GridCell, GridOrderProvider } from "./GridCell";

describe("GridCell", () => {
  it("spans the widget's default width at lg, with the md fallback", () => {
    render(
      <GridCell id="hours-trend">
        <p>x</p>
      </GridCell>
    );
    const cell = screen.getByText("x").parentElement!;
    expect(cell.dataset.gridCell).toBe("hours-trend");
    expect(cell.className).toMatch(/lg:col-span-8/);
    expect(cell.className).toMatch(/md:col-span-6/);
  });

  it("gives a narrow widget half a row at md", () => {
    render(
      <GridCell id="who-is-out">
        <p>x</p>
      </GridCell>
    );
    const cell = screen.getByText("x").parentElement!;
    expect(cell.className).toMatch(/lg:col-span-4/);
    expect(cell.className).toMatch(/md:col-span-3/);
  });

  it("orders cells by the saved layout order", () => {
    render(
      <GridOrderProvider order={["b", "a"]}>
        <GridCell id="a">
          <p>A</p>
        </GridCell>
        <GridCell id="b">
          <p>B</p>
        </GridCell>
      </GridOrderProvider>
    );
    expect(screen.getByText("A").parentElement!.style.order).toBe("1");
    expect(screen.getByText("B").parentElement!.style.order).toBe("0");
  });

  it("leaves DOM order alone without a provider", () => {
    render(
      <GridCell id="a">
        <p>A</p>
      </GridCell>
    );
    expect(screen.getByText("A").parentElement!.style.order).toBe("");
  });
});
