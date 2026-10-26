import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientDataTable } from "./ClientDataTable";
import type { Client } from "@/types";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const client = (over: Partial<Client>): Client => ({
  id: 1,
  name: "Acme Corp",
  code: "ACME1",
  description: "",
  is_active: true,
  created_at: "",
  ...over,
});

const renderTable = (clients: Client[]) => {
  localStorage.clear();
  return render(
    <ClientDataTable
      clients={clients}
      onEdit={vi.fn()}
      canManage
      onArchive={vi.fn()}
      onUnarchive={vi.fn()}
      onManageArchived={vi.fn()}
    />
  );
};

describe("ClientDataTable", () => {
  it("leads each row with an initials avatar next to the client name", () => {
    renderTable([client({})]);
    expect(screen.getByText("AC")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("hides the Description column while no client has a description", () => {
    renderTable([client({}), client({ id: 2, name: "MSC", code: "msc" })]);
    expect(screen.queryByRole("columnheader", { name: /description/i })).toBeNull();
  });

  it("shows the Description column once any client has one", () => {
    renderTable([client({ description: "Retail telemetry" }), client({ id: 2, name: "MSC" })]);
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeInTheDocument();
    expect(screen.getByText("Retail telemetry")).toBeInTheDocument();
  });

  it("shows Active or Archived as the status", () => {
    renderTable([client({}), client({ id: 2, name: "Old Co", is_active: false })]);
    expect(screen.getByText("Active", { selector: "td *" })).toBeInTheDocument();
    expect(screen.getByText("Archived", { selector: "td *" })).toBeInTheDocument();
  });

  it("offers archive on active rows and restore plus archived data on archived rows", () => {
    renderTable([client({}), client({ id: 2, name: "Old Co", is_active: false })]);
    expect(screen.getByRole("button", { name: "Archive Acme Corp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unarchive Acme Corp" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unarchive Old Co" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archived data Old Co" })).toBeInTheDocument();
  });
});
