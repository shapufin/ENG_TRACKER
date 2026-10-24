import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamFormDialog } from "./TeamFormDialog";

// Same flat Select mock as TeamLeaderSelect.test.tsx (Radix is unreliable in JSDOM).
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ children, onValueChange, value }: any) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-value={value}>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, id }: any) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ children, placeholder }: any) => <span>{children || placeholder}</span>,
  };
});

const groups = [
  { calendar_group: "msc-siae", team_count: 3 },
  { calendar_group: "pod-b", team_count: 1 },
];

const form = {
  name: "Alpha",
  code: "A",
  description: "",
  team_leader_id: "",
  parent_team: "",
  calendar_group: "",
};

const renderDialog = (overrides: Partial<typeof form> = {}) => {
  const onFormChange = vi.fn();
  render(
    <TeamFormDialog
      open
      onOpenChange={vi.fn()}
      editing={null}
      form={{ ...form, ...overrides }}
      onFormChange={onFormChange}
      formErrors={{}}
      onFormErrorsChange={vi.fn()}
      groups={groups}
      onSubmit={vi.fn()}
      isSubmitting={false}
    />
  );
  return onFormChange;
};

describe("TeamFormDialog calendar group picker", () => {
  it("lists existing groups with their team counts instead of a free-text box", () => {
    renderDialog();
    expect(screen.getByRole("option", { name: "msc-siae (3 teams)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "pod-b (1 team)" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /calendar group/i })).toBeNull();
  });

  it("picking a group stores its exact name", () => {
    const onFormChange = renderDialog();
    fireEvent.click(screen.getByRole("option", { name: "msc-siae (3 teams)" }));
    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ calendar_group: "msc-siae" })
    );
  });

  it("No group clears the stored name", () => {
    const onFormChange = renderDialog({ calendar_group: "msc-siae" });
    fireEvent.click(screen.getByRole("option", { name: "No group" }));
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ calendar_group: "" }));
  });

  it("New group reveals a name input that previews the normalised name", () => {
    const onFormChange = renderDialog();
    fireEvent.click(screen.getByRole("option", { name: "New group…" }));
    const input = screen.getByRole("textbox", { name: "New group name" });
    fireEvent.change(input, { target: { value: "Client Pod" } });
    expect(onFormChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ calendar_group: "Client Pod" })
    );
  });

  it("shows the saved-as preview when the typed name would be normalised", () => {
    renderDialog({ calendar_group: "Client Pod" });
    fireEvent.click(screen.getByRole("option", { name: "New group…" }));
    expect(screen.getByText('Will be saved as "client-pod"')).toBeInTheDocument();
  });
});
