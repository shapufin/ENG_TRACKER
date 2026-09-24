import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageShell } from "@/components/layout/PageShell";
import { onboardingService } from "../services/onboardingService";
import type { OfficeEditorConfig } from "../types/onboarding";

const EDITOR_CONTAINER_ID = "onboarding-office-editor";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        containerId: string,
        config: OfficeEditorConfig
      ) => { destroyEditor: () => void };
    };
  }
}

/** Loads OnlyOffice's own `api.js` from the configured document server (a
 * third-party, server-hosted script — not npm-bundlable) and hands it the
 * signed config. One `<script>` tag per document-server origin, reused
 * across mounts rather than re-injected. */
function loadDocsApiScript(documentServerUrl: string): Promise<void> {
  const src = `${documentServerUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
  if (window.DocsAPI) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load editor script.")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load editor script."));
    document.body.appendChild(script);
  });
}

export const DocumentEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const documentId = Number(id);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const editorInstanceRef = useRef<{ destroyEditor: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { config, document_server_url } =
          await onboardingService.getOfficeEditorConfig(documentId);
        await loadDocsApiScript(document_server_url);
        if (cancelled || !window.DocsAPI) return;
        editorInstanceRef.current = new window.DocsAPI.DocEditor(EDITOR_CONTAINER_ID, config);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
      editorInstanceRef.current?.destroyEditor();
      editorInstanceRef.current = null;
    };
  }, [documentId]);

  return (
    <PageShell
      title="Edit document"
      subtitle="Changes save automatically to the document server."
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      }
    >
      {status === "error" && (
        <ErrorCard
          title="Couldn't open the editor"
          message="The document server may be unavailable, or this file can't be edited here."
        />
      )}
      {status === "loading" && <LoadingCard />}
      <div
        id={EDITOR_CONTAINER_ID}
        className="h-[calc(100vh-14rem)] min-h-[480px] w-full overflow-hidden rounded-lg border border-line-subtle"
        style={{ display: status === "ready" ? "block" : "none" }}
      />
    </PageShell>
  );
};
