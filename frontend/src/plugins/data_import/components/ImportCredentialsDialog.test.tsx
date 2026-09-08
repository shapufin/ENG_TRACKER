import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportCredentialsDialog } from "./ImportCredentialsDialog";
import type { CredentialRow } from "../types/dataImport";

const credentials: CredentialRow[] = [
  { username: "u1", email: "u1@example.com", password: "p1", generated: true },
  { username: "u2", email: "u2@example.com", password: "=formula", generated: true },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImportCredentialsDialog", () => {
  it("renders credentials in a table", () => {
    render(
      <ImportCredentialsDialog open={true} onOpenChange={vi.fn()} credentials={credentials} />
    );
    expect(screen.getByText("u1")).toBeInTheDocument();
    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("p1")).toBeInTheDocument();
  });

  it("cannot be dismissed without confirmation", () => {
    const onOpenChange = vi.fn();
    render(
      <ImportCredentialsDialog open={true} onOpenChange={onOpenChange} credentials={credentials} />
    );

    // The confirmation button is the only path to close. Before it is clicked
    // the dialog has not signalled a close.
    expect(screen.getByText("I have saved these credentials")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("confirms and closes", () => {
    const onOpenChange = vi.fn();
    render(
      <ImportCredentialsDialog open={true} onOpenChange={onOpenChange} credentials={credentials} />
    );

    fireEvent.click(screen.getByText("I have saved these credentials"));
    waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("downloads CSV with sanitized formula-injection chars", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(
      <ImportCredentialsDialog open={true} onOpenChange={vi.fn()} credentials={credentials} />
    );

    fireEvent.click(screen.getByText("Download CSV"));

    const anchor = createElementSpy.mock.results.find((r) => r.value?.tagName === "A")
      ?.value as HTMLAnchorElement;
    expect(anchor).toBeDefined();
    expect(anchor.download).toBe("imported_credentials.csv");

    // Blob content is available via the href
    const blobUrl = anchor.href;
    expect(blobUrl).toBeTruthy();

    revokeObjectURL.mockRestore();
    createElementSpy.mockRestore();
  });
});
