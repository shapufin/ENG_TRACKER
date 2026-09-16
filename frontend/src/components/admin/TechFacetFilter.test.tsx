import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TechFacetFilter } from "./TechFacetFilter";

const k8sLevels = [
  { id: 10, name: "Level 1", code: "L1", rank: 1, count: 7 },
  { id: 11, name: "Level 2", code: "L2", rank: 2, count: 5 },
];
const facets = [
  { id: 1, name: "Kubernetes", code: "K8S", count: 12, levels: k8sLevels, no_level_count: 0 },
  { id: 2, name: "Django", code: "DJANGO", count: 9, levels: [], no_level_count: 9 },
];

describe("TechFacetFilter", () => {
  it("renders each tech chip with its live count and the no-tech chip", () => {
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Django")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText(/No tech/)).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("toggling an unselected tech chip adds it to the selection", () => {
    const onTechIdsChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={onTechIdsChange}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Kubernetes"));
    expect(onTechIdsChange).toHaveBeenCalledWith([1]);
  });

  it("toggling an already-selected tech chip removes it from the selection", () => {
    const onTechIdsChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[1, 2]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={onTechIdsChange}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Kubernetes"));
    expect(onTechIdsChange).toHaveBeenCalledWith([2]);
  });

  it("clicking 'All tech' clears both the tech selection and no-tech-only", () => {
    const onTechIdsChange = vi.fn();
    const onNoTechOnlyChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[1]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={onTechIdsChange}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={onNoTechOnlyChange}
      />
    );
    fireEvent.click(screen.getByText("All tech"));
    expect(onTechIdsChange).toHaveBeenCalledWith([]);
    expect(onNoTechOnlyChange).toHaveBeenCalledWith(false);
  });

  it("clicking the No tech chip toggles noTechOnly", () => {
    const onNoTechOnlyChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={onNoTechOnlyChange}
      />
    );
    fireEvent.click(screen.getByText(/No tech/));
    expect(onNoTechOnlyChange).toHaveBeenCalledWith(true);
  });

  it("hides level chips until their tech is selected", () => {
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    expect(screen.queryByText("L1")).not.toBeInTheDocument();
  });

  it("shows the selected tech's level chips with their counts", () => {
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[1]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    expect(screen.getByText("L1")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("L2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("toggling a level chip adds it to the level selection", () => {
    const onLevelIdsChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[1]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={onLevelIdsChange}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("L1"));
    expect(onLevelIdsChange).toHaveBeenCalledWith([10]);
  });

  it("deselecting a tech drops that tech's level selections too", () => {
    const onTechIdsChange = vi.fn();
    const onLevelIdsChange = vi.fn();
    render(
      <TechFacetFilter
        facets={facets}
        noTechCount={25}
        selectedTechIds={[1]}
        selectedLevelIds={[10, 11]}
        noTechOnly={false}
        onTechIdsChange={onTechIdsChange}
        onLevelIdsChange={onLevelIdsChange}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Kubernetes"));
    expect(onTechIdsChange).toHaveBeenCalledWith([]);
    expect(onLevelIdsChange).toHaveBeenCalledWith([]);
  });

  it("renders nothing when there are no techs and no no-tech users", () => {
    const { container } = render(
      <TechFacetFilter
        facets={[]}
        noTechCount={0}
        selectedTechIds={[]}
        selectedLevelIds={[]}
        noTechOnly={false}
        onTechIdsChange={vi.fn()}
        onLevelIdsChange={vi.fn()}
        onNoTechOnlyChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
