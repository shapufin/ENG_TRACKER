import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { OrgNode, type OrgNodeData } from "../components/OrgNode";

const nodeProps = (data: OrgNodeData): NodeProps =>
  ({
    id: "n1",
    type: "org",
    data,
    position: { x: 0, y: 0 },
  }) as unknown as NodeProps;

describe("OrgNode role badges", () => {
  it("renders TL badges with a dark-mode translucent treatment (not pastel)", () => {
    render(
      <ReactFlowProvider>
        <OrgNode
          {...nodeProps({ nodeType: "person", label: "Andrea Negro", roleBadge: "italian_tl" })}
        />
      </ReactFlowProvider>
    );
    const badge = screen.getByLabelText("Role: IT TL");
    expect(badge.className).toContain("dark:bg-blue-500/15");
    expect(badge.className).toContain("dark:text-blue-300");
  });

  it("renders AL TL badges with a dark-mode translucent treatment", () => {
    render(
      <ReactFlowProvider>
        <OrgNode
          {...nodeProps({ nodeType: "person", label: "Enri Demnushi", roleBadge: "albanian_tl" })}
        />
      </ReactFlowProvider>
    );
    const badge = screen.getByLabelText("Role: AL TL");
    expect(badge.className).toContain("dark:bg-purple-500/15");
    expect(badge.className).toContain("dark:text-purple-300");
  });
});

// Elevation contract: person nodes sit on the dark dotted canvas and need
// visible elevation (shadow-md + a subtle brand-tinted ambient shadow) so a
// lone root node doesn't read as flat (screenshot review 2026-09-07).
describe("OrgNode elevation", () => {
  it("gives person nodes elevated shadows with a subtle brand tint", () => {
    const { container } = render(
      <ReactFlowProvider>
        <OrgNode {...nodeProps({ nodeType: "person", label: "E2E TeamLeader" })} />
      </ReactFlowProvider>
    );
    const node = container.firstElementChild as HTMLElement;
    expect(node.className).toContain("shadow-md");
    expect(node.className).toContain("shadow-primary/10");
    expect(node.className).toContain("hover:shadow-lg");
  });

  it("keeps tech nodes visually secondary (muted surface, lighter shadow)", () => {
    const { container } = render(
      <ReactFlowProvider>
        <OrgNode {...nodeProps({ nodeType: "tech", label: "Tech Node" })} />
      </ReactFlowProvider>
    );
    const node = container.firstElementChild as HTMLElement;
    expect(node.className).toContain("bg-muted/50");
    expect(node.className).toContain("shadow-sm");
  });
});
