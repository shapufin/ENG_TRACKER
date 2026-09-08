/** Tests for the custom builder edge components and style helpers. */
import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";
import {
  edgePathStyle,
  markerEndFor,
  builderEdgeType,
  builderEdgeProps,
  edgeTypeFromBuilder,
} from "../components/builderEdgeHelpers";
import type { EdgeType } from "../types";

describe("edgePathStyle", () => {
  it("returns solid dark stroke for reports_to", () => {
    const style = edgePathStyle("reports_to");
    expect(style.stroke).toBe("#1e293b");
    expect(style.strokeWidth).toBe(2);
    expect(style.strokeDasharray).toBeUndefined();
  });

  it("returns solid blue stroke for contains", () => {
    const style = edgePathStyle("contains");
    expect(style.stroke).toBe("#2563eb");
    expect(style.strokeWidth).toBe(2);
    expect(style.strokeDasharray).toBeUndefined();
  });

  it("returns dashed amber stroke for dotted_line", () => {
    const style = edgePathStyle("dotted_line");
    expect(style.stroke).toBe("#f59e0b");
    expect(style.strokeDasharray).toBe("6 4");
  });

  it("returns dashed purple stroke for assistant", () => {
    const style = edgePathStyle("assistant");
    expect(style.stroke).toBe("#a855f7");
    expect(style.strokeDasharray).toBe("4 4");
  });

  it("returns dotted slate stroke for association", () => {
    const style = edgePathStyle("association");
    expect(style.stroke).toBe("#64748b");
    expect(style.strokeDasharray).toBe("2 4");
  });
});

describe("markerEndFor", () => {
  it("returns an ArrowClosed marker object for hierarchy edges", () => {
    expect(markerEndFor("reports_to")).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#1e293b",
    });
    expect(markerEndFor("contains")).toEqual({
      type: MarkerType.ArrowClosed,
      color: "#2563eb",
    });
  });

  it("returns undefined for non-hierarchy edges", () => {
    expect(markerEndFor("dotted_line")).toBeUndefined();
    expect(markerEndFor("assistant")).toBeUndefined();
    expect(markerEndFor("association")).toBeUndefined();
  });
});

describe("builderEdgeProps", () => {
  it("returns type + markerEnd for hierarchy edges", () => {
    const props = builderEdgeProps("reports_to");
    expect(props.type).toBe("builder-reports_to");
    expect(props.markerEnd).toEqual({ type: MarkerType.ArrowClosed, color: "#1e293b" });
  });

  it("returns type without markerEnd for non-hierarchy edges", () => {
    const props = builderEdgeProps("dotted_line");
    expect(props.type).toBe("builder-dotted_line");
    expect(props.markerEnd).toBeUndefined();
  });
});

describe("builderEdgeType / edgeTypeFromBuilder", () => {
  const allTypes: EdgeType[] = [
    "reports_to",
    "dotted_line",
    "assistant",
    "association",
    "contains",
  ];

  it("round-trips all edge types", () => {
    for (const t of allTypes) {
      const builderType = builderEdgeType(t);
      expect(edgeTypeFromBuilder(builderType)).toBe(t);
    }
  });

  it("defaults to reports_to for unknown/undefined types", () => {
    expect(edgeTypeFromBuilder(undefined)).toBe("reports_to");
    expect(edgeTypeFromBuilder("step")).toBe("reports_to");
    expect(edgeTypeFromBuilder("simplebezier")).toBe("reports_to");
  });

  it("prefixes with builder- to avoid collision with built-in types", () => {
    expect(builderEdgeType("reports_to")).toBe("builder-reports_to");
    expect(builderEdgeType("contains")).toBe("builder-contains");
  });
});
