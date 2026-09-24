import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { SearchResultsList } from "./SearchResultsList";

describe("SearchResultsList", () => {
  it("renders an empty state when nothing matches", () => {
    render(
      <SearchResultsList
        folders={[]}
        documents={[]}
        onOpenFolder={vi.fn()}
        onOpenDocument={vi.fn()}
      />
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("renders folder and document results with their path context", () => {
    render(
      <SearchResultsList
        folders={[{ id: 1, name: "Contracts", parent: null, path: "Legal", ancestors: [] }]}
        documents={[
          { id: 2, name: "Signed.pdf", folder: 1, path: "Legal / Contracts", ancestors: [] },
        ]}
        onOpenFolder={vi.fn()}
        onOpenDocument={vi.fn()}
      />
    );
    expect(screen.getByText("Contracts")).toBeInTheDocument();
    expect(screen.getByText("Legal")).toBeInTheDocument();
    expect(screen.getByText("Signed.pdf")).toBeInTheDocument();
    expect(screen.getByText("Legal / Contracts")).toBeInTheDocument();
  });

  it("calls onOpenFolder/onOpenDocument with the result on click", () => {
    const onOpenFolder = vi.fn();
    const onOpenDocument = vi.fn();
    const folder = { id: 1, name: "Contracts", parent: null, path: null, ancestors: [] };
    const doc = {
      id: 2,
      name: "Signed.pdf",
      folder: 1,
      path: "Legal / Contracts",
      ancestors: [{ id: 1, name: "Legal" }],
    };
    render(
      <SearchResultsList
        folders={[folder]}
        documents={[doc]}
        onOpenFolder={onOpenFolder}
        onOpenDocument={onOpenDocument}
      />
    );
    fireEvent.click(screen.getByText("Contracts"));
    fireEvent.click(screen.getByText("Signed.pdf"));
    expect(onOpenFolder).toHaveBeenCalledWith(folder);
    expect(onOpenDocument).toHaveBeenCalledWith(doc);
  });

  it("is keyboard-activatable (Enter) — not just clickable", () => {
    const onOpenFolder = vi.fn();
    const folder = { id: 1, name: "Contracts", parent: null, path: null, ancestors: [] };
    render(
      <SearchResultsList
        folders={[folder]}
        documents={[]}
        onOpenFolder={onOpenFolder}
        onOpenDocument={vi.fn()}
      />
    );
    const row = screen.getByRole("button", { name: /Contracts/ });
    expect(row).toHaveAttribute("tabIndex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpenFolder).toHaveBeenCalledWith(folder);
  });
});
