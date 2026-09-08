/** Tests for the builder node renderer. */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { BuilderNode } from "../components/BuilderNode";

const mocks = vi.hoisted(() => ({
  Handle: (props: { type: string; position: string }) =>
    React.createElement("div", {
      "data-testid": `${props.type}-${props.position}-handle`,
    }),
  Position: { Top: "top", Bottom: "bottom" },
}));

vi.mock("@xyflow/react", () => ({
  Handle: mocks.Handle,
  Position: mocks.Position,
}));

describe("BuilderNode", () => {
  it("renders display name, shape label, and role title", () => {
    const { getByText } = render(
      React.createElement(BuilderNode, {
        data: {
          shape_type: "department",
          display_name: "Engineering",
          role_title: "Core",
          status: "active",
        },
        selected: false,
      } as unknown as never)
    );

    expect(getByText("Engineering")).toBeInTheDocument();
    expect(getByText("Department")).toBeInTheDocument();
    expect(getByText("Core")).toBeInTheDocument();
  });

  it("omits role title when not provided", () => {
    const { getByText, queryByText } = render(
      React.createElement(BuilderNode, {
        data: {
          shape_type: "person",
          display_name: "Alice",
          status: "active",
        },
        selected: true,
      } as unknown as never)
    );

    expect(getByText("Alice")).toBeInTheDocument();
    expect(getByText("Person")).toBeInTheDocument();
    expect(queryByText("Core")).not.toBeInTheDocument();
  });
});
