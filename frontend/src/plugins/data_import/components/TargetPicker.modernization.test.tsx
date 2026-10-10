import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TargetPicker } from "./TargetPicker";

describe("TargetPicker modernization", () => {
  it("uses GlassCard target tiles", () => {
    const { container } = render(
      <TargetPicker
        targets={[
          {
            target_key: "users",
            display_name: "Users",
            description: "Users",
            permission_scope: "manage",
            icon: "Users",
            page_route: "/admin/users",
            fields: [],
            options: [],
            sample_rows: [],
            dedupe_keys: [],
          },
        ]}
        selectedTargetKey={null}
        onSelect={() => {}}
      />
    );

    expect(container.querySelector(".shadow-card")).toBeInTheDocument();
  });
});

describe("TargetPicker accessibility", () => {
  const mk = (key: string, icon: string) => ({
    target_key: key,
    display_name: `Name ${key}`,
    description: "Desc",
    permission_scope: "manage",
    icon,
    page_route: "/admin/x",
    fields: [],
    options: [],
    sample_rows: [],
    dedupe_keys: [],
  });
  const targets = [mk("a", "Users"), mk("b", "Cpu"), mk("c", "Unknown")];

  it("renders a radiogroup of radios with aria-checked and an icon on every card", () => {
    const { container } = render(
      <TargetPicker targets={targets} selectedTargetKey="b" onSelect={() => {}} />
    );
    expect(screen.getByRole("radiogroup", { name: "Import target" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(container.querySelectorAll("svg.lucide").length).toBeGreaterThanOrEqual(3);
    radios.forEach((r) => {
      expect(r.closest("[class*='shadow-card']")?.querySelector("svg")).not.toBeNull();
    });
  });

  it("moves selection with ArrowRight and supports roving tabindex", () => {
    const onSelect = vi.fn();
    render(<TargetPicker targets={targets} selectedTargetKey="a" onSelect={onSelect} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("selects on click", () => {
    const onSelect = vi.fn();
    render(<TargetPicker targets={targets} selectedTargetKey={null} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("does not select the card when a template button is clicked", () => {
    const onSelect = vi.fn();
    render(<TargetPicker targets={targets} selectedTargetKey={null} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Sample CSV/ })[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
