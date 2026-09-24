import React from "react";
import { File as FileIcon, Folder as FolderIcon, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import type { SearchDocumentResult, SearchFolderResult } from "../types/onboarding";

interface SearchResultsListProps {
  folders: SearchFolderResult[];
  documents: SearchDocumentResult[];
  onOpenFolder: (folder: SearchFolderResult) => void;
  onOpenDocument: (document: SearchDocumentResult) => void;
}

const onActivateKeyDown = (onActivate: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
};

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  folders,
  documents,
  onOpenFolder,
  onOpenDocument,
}) => {
  if (folders.length === 0 && documents.length === 0) {
    return (
      <EmptyState icon={SearchX} title="No matches" description="Try a different name or keyword." />
    );
  }

  return (
    <div className="space-y-2">
      {folders.map((folder) => (
        <GlassCard
          key={`folder-${folder.id}`}
          animateOnMount={false}
          isHoverLift={false}
          className="flex cursor-pointer items-center gap-3 p-3"
          onClick={() => onOpenFolder(folder)}
          role="button"
          tabIndex={0}
          onKeyDown={onActivateKeyDown(() => onOpenFolder(folder))}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--chart-1) / 0.28), hsl(var(--chart-1) / 0.08))",
            }}
          >
            <FolderIcon className="h-4 w-4 text-chart-1" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{folder.name}</p>
            {folder.path && <p className="truncate text-xs text-muted-foreground">{folder.path}</p>}
          </div>
        </GlassCard>
      ))}
      {documents.map((document) => (
        <GlassCard
          key={`document-${document.id}`}
          animateOnMount={false}
          isHoverLift={false}
          className="flex cursor-pointer items-center gap-3 p-3"
          onClick={() => onOpenDocument(document)}
          role="button"
          tabIndex={0}
          onKeyDown={onActivateKeyDown(() => onOpenDocument(document))}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--chart-2) / 0.28), hsl(var(--chart-2) / 0.08))",
            }}
          >
            <FileIcon className="h-4 w-4 text-chart-2" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{document.name}</p>
            {document.path && (
              <p className="truncate text-xs text-muted-foreground">{document.path}</p>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  );
};
