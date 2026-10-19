import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientStatsCards } from "./ClientStatsCards";
import type { Client } from "@/types";

const c = (id: number, is_active: boolean) =>
  ({ id, name: `C${id}`, code: `C${id}`, description: "", is_active, created_at: "" }) as Client;

describe("ClientStatsCards", () => {
  it("counts total, active and inactive clients from the list", () => {
    render(<ClientStatsCards clients={[c(1, true), c(2, true), c(3, false)]} />);
    expect(screen.getByText("Total clients")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
