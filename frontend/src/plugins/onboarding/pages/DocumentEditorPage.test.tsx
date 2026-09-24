import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DocumentEditorPage } from "./DocumentEditorPage";
import { onboardingService } from "../services/onboardingService";
import type { OfficeEditorConfig } from "../types/onboarding";

vi.mock("../services/onboardingService", () => ({
  onboardingService: {
    getOfficeEditorConfig: vi.fn(),
  },
}));

const CONFIG: OfficeEditorConfig = {
  document: { fileType: "docx", key: "1-123", title: "notes.docx", url: "http://x/file" },
  documentType: "word",
  editorConfig: {
    mode: "edit",
    callbackUrl: "http://x/callback",
    user: { id: "1", name: "Alice" },
  },
  token: "signed-jwt",
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/onboarding/documents/7/edit"]}>
      <Routes>
        <Route path="/onboarding/documents/:id/edit" element={<DocumentEditorPage />} />
      </Routes>
    </MemoryRouter>
  );

describe("DocumentEditorPage", () => {
  let docEditorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    docEditorMock = vi.fn().mockImplementation(() => ({ destroyEditor: vi.fn() }));
    window.DocsAPI = { DocEditor: docEditorMock as any };
  });

  afterEach(() => {
    delete window.DocsAPI;
    document.querySelectorAll("script").forEach((s) => s.remove());
    vi.restoreAllMocks();
  });

  it("fetches the editor config and constructs DocsAPI.DocEditor against the editor container", async () => {
    (onboardingService.getOfficeEditorConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      config: CONFIG,
      document_server_url: "http://onlyoffice.test",
    });

    renderPage();

    await waitFor(() => expect(docEditorMock).toHaveBeenCalledTimes(1));
    expect(docEditorMock).toHaveBeenCalledWith("onboarding-office-editor", CONFIG);
    expect(onboardingService.getOfficeEditorConfig).toHaveBeenCalledWith(7);
  });

  it("shows an error state when the config fetch fails", async () => {
    (onboardingService.getOfficeEditorConfig as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );

    renderPage();

    await waitFor(() => expect(screen.getByText("Couldn't open the editor")).toBeInTheDocument());
    expect(docEditorMock).not.toHaveBeenCalled();
  });
});
