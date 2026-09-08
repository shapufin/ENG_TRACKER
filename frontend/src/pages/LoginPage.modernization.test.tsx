import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { LoginPage } from "./LoginPage";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

describe("LoginPage modernization", () => {
  it("uses semantic background tokens instead of a raw gradient", () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelector(".bg-background")).toBeInTheDocument();
  });
});
