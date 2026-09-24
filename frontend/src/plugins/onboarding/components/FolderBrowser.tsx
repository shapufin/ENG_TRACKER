import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlugins } from "@/context/PluginContext";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronRight,
  File as FileIcon,
  FilePlus,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  Info,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { onboardingService } from "../services/onboardingService";
import type { Document, Folder, SearchDocumentResult, SearchFolderResult } from "../types/onboarding";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { SearchResultsList } from "./SearchResultsList";
import { UploadDropzone } from "./UploadDropzone";
import { isEditableOffice } from "../lib/officeFiles";
import { DetailPanel, type DetailPanelItem } from "./DetailPanel";

interface FolderBrowserProps {
  clientId: number;
  clientName: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** GlassCard tiles are div-based click targets — this makes them reachable
 * and activatable from the keyboard (Enter/Space), matching native <button>
 * semantics, since a clickable div carries none of that on its own. */
const onActivateKeyDown = (onActivate: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
};

type RenameTarget = { kind: "folder" | "document"; id: number; name: string } | null;
type DeleteTarget =
  | { kind: "folder"; id: number; name: string; childCount: number }
  | { kind: "document"; id: number; name: string }
  | null;

const FolderTile: React.FC<{
  folder: Folder;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onInfo: () => void;
}> = ({ folder, onOpen, onRename, onDelete, onInfo }) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: { kind: "folder", id: folder.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder-drop-${folder.id}`,
    data: { kind: "folder", id: folder.id },
  });

  return (
    <GlassCard
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      animateOnMount={false}
      isHoverLift={false}
      glow={isOver ? "primary" : "none"}
      className={cn(
        "group flex cursor-pointer items-center gap-3 p-4 transition-all",
        isOver && "scale-[1.02] ring-2 ring-primary",
        isDragging && "opacity-40"
      )}
      onClick={onOpen}
      {...attributes}
      {...listeners}
      onKeyDown={onActivateKeyDown(onOpen)}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-inner transition-transform duration-200 group-hover:scale-110"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--chart-1) / 0.28), hsl(var(--chart-1) / 0.08))",
        }}
      >
        <FolderIcon className="h-5 w-5 text-chart-1" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{folder.name}</p>
        <p className="text-xs text-muted-foreground">
          {folder.child_count} folder{folder.child_count === 1 ? "" : "s"} ·{" "}
          {folder.document_count} file{folder.document_count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`View details for ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onInfo();
          }}
        >
          <Info className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Rename ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          aria-label={`Delete ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </GlassCard>
  );
};

const DocumentTile: React.FC<{
  document: Document;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onInfo: () => void;
}> = ({ document, onDownload, onRename, onDelete, onInfo }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `document-${document.id}`,
    data: { kind: "document", id: document.id },
  });

  return (
    <GlassCard
      ref={setNodeRef}
      animateOnMount={false}
      isHoverLift={false}
      className={cn(
        "group flex cursor-pointer items-center gap-3 p-4 transition-all",
        isDragging && "opacity-40"
      )}
      onClick={onDownload}
      {...attributes}
      {...listeners}
      onKeyDown={onActivateKeyDown(onDownload)}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-inner transition-transform duration-200 group-hover:scale-110"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--chart-2) / 0.28), hsl(var(--chart-2) / 0.08))",
        }}
      >
        <FileIcon className="h-5 w-5 text-chart-2" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(document.size_bytes)}</p>
      </div>
      <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`View details for ${document.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onInfo();
          }}
        >
          <Info className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Rename ${document.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          aria-label={`Delete ${document.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </GlassCard>
  );
};

export const FolderBrowser: React.FC<FolderBrowserProps> = ({ clientId, clientName }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { activePlugins } = usePlugins();
  const officeEditorEnabled = Boolean(
    activePlugins.find((p) => p.name === "onboarding")?.settings?.office_editor_enabled
  );
  const [trail, setTrail] = useState<{ id: number; name: string }[]>([]);
  const currentFolderId = trail.length ? trail[trail.length - 1].id : null;

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<{ kind: "folder" | "document"; id: number } | null>(
    null
  );
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const isSearching = debouncedSearch.trim().length > 0;

  const foldersKey = ["onboarding", "folders", clientId, currentFolderId];
  const documentsKey = ["onboarding", "documents", clientId, currentFolderId];

  // Not gated on `!isSearching`: this app's React Query defaults are
  // staleTime 0 + refetchOnMount true, so disabling a query and re-enabling
  // it later (when search is cleared) is treated as a fresh mount and
  // refetches even though the cached data for this folder never changed.
  // Only *rendering* is gated on isSearching, below.
  const foldersQuery = useQuery({
    queryKey: foldersKey,
    queryFn: () => onboardingService.getFolders(clientId, currentFolderId),
  });
  const documentsQuery = useQuery({
    queryKey: documentsKey,
    queryFn: () => onboardingService.getDocuments(clientId, currentFolderId),
  });
  const searchQuery = useQuery({
    queryKey: ["onboarding", "search", clientId, debouncedSearch],
    queryFn: () => onboardingService.search(clientId, debouncedSearch),
    enabled: isSearching,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["onboarding", "folders", clientId] });
    queryClient.invalidateQueries({ queryKey: ["onboarding", "documents", clientId] });
  };

  // Every mutation below shares this shape (invalidate on success, toast the
  // backend's actual reason — not a generic fallback — on failure). The
  // backend returns a specific message per failure mode (name collision,
  // cross-client move, depth limit); showing only `fallbackMessage` hid that
  // detail and could actively mislead (e.g. a cross-client move failure read
  // "check it isn't going into itself").
  function useInvalidatingMutation<TVariables>(
    mutationFn: (variables: TVariables) => Promise<unknown>,
    fallbackMessage: string
  ) {
    return useMutation({
      mutationFn,
      onSuccess: invalidate,
      onError: (err: unknown) => toast.error(extractApiErrorMessage(err, fallbackMessage)),
    });
  }

  const createFolderMutation = useInvalidatingMutation(
    (name: string) => onboardingService.createFolder({ client: clientId, parent: currentFolderId, name }),
    "Could not create folder."
  );
  const renameFolderMutation = useInvalidatingMutation(
    ({ id, name }: { id: number; name: string }) => onboardingService.renameFolder(id, name),
    "Could not rename folder."
  );
  const renameDocumentMutation = useInvalidatingMutation(
    ({ id, name }: { id: number; name: string }) => onboardingService.renameDocument(id, name),
    "Could not rename file."
  );
  const deleteFolderMutation = useInvalidatingMutation(
    (id: number) => onboardingService.deleteFolder(id),
    "Could not delete folder."
  );
  const deleteDocumentMutation = useInvalidatingMutation(
    (id: number) => onboardingService.deleteDocument(id),
    "Could not delete file."
  );
  const moveFolderMutation = useInvalidatingMutation(
    ({ id, parentId }: { id: number; parentId: number | null }) =>
      onboardingService.moveFolder(id, parentId),
    "Could not move folder."
  );
  const moveDocumentMutation = useInvalidatingMutation(
    ({ id, folderId }: { id: number; folderId: number | null }) =>
      onboardingService.moveDocument(id, folderId),
    "Could not move file."
  );
  // Not routed through useInvalidatingMutation: a multi-file drop fires N
  // uploads, and invalidating after each one settles (up to 2N refetches for
  // N files) is wasted work — invalidate once after the whole batch settles.
  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      onboardingService.uploadDocument({ client: clientId, folder: currentFolderId, file }),
    onError: (err: unknown) => toast.error(extractApiErrorMessage(err, "Could not upload file.")),
  });

  const handleUploadFiles = async (files: File[]) => {
    await Promise.allSettled(files.map((f) => uploadMutation.mutateAsync(f)));
    invalidate();
  };

  const handleDownload = async (doc: { id: number; name: string }) => {
    try {
      const blob = await onboardingService.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download file.");
    }
  };

  // PDFs render natively in a browser tab — fetch the (authenticated) blob
  // and hand the browser an object URL instead of forcing a download.
  // Word/Excel files have no native browser renderer, so there's nothing
  // useful to open this way for them yet (see DetailPanel's isPreviewable).
  // The object URL is intentionally not revoked here: the new tab needs it
  // to stay valid while it loads, and this is a one-off per click, not an
  // accumulating leak.
  //
  // window.open() is called synchronously, inside the click handler itself
  // — not after the `await` below. Calling it post-await loses the
  // "triggered directly by a user gesture" context browsers require, and
  // gets silently popup-blocked (found live: the request succeeded, no tab
  // opened, no console error). Opening a blank tab first and redirecting it
  // once the blob resolves keeps it inside the gesture.
  const handlePreview = async (doc: { id: number; name: string }) => {
    const previewTab = window.open("", "_blank", "noopener");
    try {
      const blob = await onboardingService.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      if (previewTab) {
        previewTab.location.href = url;
      } else {
        toast.error("Preview was blocked by the browser's popup blocker.");
      }
    } catch {
      previewTab?.close();
      toast.error("Could not open preview.");
    }
  };

  const handleEdit = (doc: { id: number }) => {
    navigate(`/onboarding/documents/${doc.id}/edit`);
  };

  const handleOpenSearchFolder = (folder: SearchFolderResult) => {
    setSearchInput("");
    setTrail([...folder.ancestors, { id: folder.id, name: folder.name }]);
  };
  const handleOpenSearchDocument = (document: SearchDocumentResult) => {
    handleDownload(document);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const kind = event.active.data.current?.kind;
    const id = event.active.data.current?.id as number;
    if (kind === "folder") {
      setActiveDragLabel(foldersQuery.data?.find((f) => f.id === id)?.name ?? null);
    } else {
      setActiveDragLabel(documentsQuery.data?.find((d) => d.id === id)?.name ?? null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragLabel(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeData = active.data.current as { kind: string; id: number };
    const overData = over.data.current as { kind: string; id: number } | undefined;
    if (!overData || overData.kind !== "folder") return;
    if (activeData.kind === "folder") {
      if (activeData.id === overData.id) return;
      moveFolderMutation.mutate({ id: activeData.id, parentId: overData.id });
    } else if (activeData.kind === "document") {
      moveDocumentMutation.mutate({ id: activeData.id, folderId: overData.id });
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: "breadcrumb-root",
    data: { kind: "folder", id: null },
  });

  // Derived (not stored) from live query data, so renaming/deleting the
  // currently-selected item, or navigating away, keeps the panel in sync —
  // it closes on its own once the id drops out of the current listing.
  const selectedItem: DetailPanelItem | null =
    selectedKey?.kind === "folder"
      ? (() => {
          const folder = foldersQuery.data?.find((f) => f.id === selectedKey.id);
          return folder ? { kind: "folder" as const, data: folder } : null;
        })()
      : selectedKey?.kind === "document"
        ? (() => {
            const doc = documentsQuery.data?.find((d) => d.id === selectedKey.id);
            return doc ? { kind: "document" as const, data: doc } : null;
          })()
        : null;

  const isEmpty =
    !foldersQuery.isLoading &&
    !documentsQuery.isLoading &&
    (foldersQuery.data?.length ?? 0) === 0 &&
    (documentsQuery.data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <button
          ref={setRootDropRef}
          type="button"
          onClick={() => setTrail([])}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
            trail.length === 0
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent",
            isRootOver && "ring-2 ring-primary"
          )}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {clientName}
        </button>
        {trail.map((crumb, idx) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setTrail(trail.slice(0, idx + 1))}
              className={cn(
                "rounded-full px-3 py-1.5 font-medium transition-colors",
                idx === trail.length - 1
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" /> New folder
          </Button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${clientName}...`}
            aria-label="Search folders and files"
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {isSearching ? (
            searchQuery.isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Searching...</p>
            ) : (
              <SearchResultsList
                folders={searchQuery.data?.folders ?? []}
                documents={searchQuery.data?.documents ?? []}
                onOpenFolder={handleOpenSearchFolder}
                onOpenDocument={handleOpenSearchDocument}
              />
            )
          ) : (
            <>
              <UploadDropzone onFiles={handleUploadFiles} />

              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                {isEmpty ? (
                  <EmptyState
                    icon={FilePlus}
                    title="This folder is empty"
                    description="Create a subfolder or upload a file to get started."
                  />
                ) : (
                  <motion.div
                    key={currentFolderId ?? "root"}
                    initial={shouldReduceMotion ? false : "hidden"}
                    animate="visible"
                    variants={staggerContainer}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {foldersQuery.data?.map((folder) => (
                      <motion.div key={`folder-${folder.id}`} variants={staggerItem}>
                        <FolderTile
                          folder={folder}
                          onOpen={() => setTrail([...trail, { id: folder.id, name: folder.name }])}
                          onRename={() =>
                            setRenameTarget({ kind: "folder", id: folder.id, name: folder.name })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              kind: "folder",
                              id: folder.id,
                              name: folder.name,
                              childCount: folder.child_count + folder.document_count,
                            })
                          }
                          onInfo={() => setSelectedKey({ kind: "folder", id: folder.id })}
                        />
                      </motion.div>
                    ))}
                    {documentsQuery.data?.map((doc) => (
                      <motion.div key={`document-${doc.id}`} variants={staggerItem}>
                        <DocumentTile
                          document={doc}
                          onDownload={() => handleDownload(doc)}
                          onRename={() =>
                            setRenameTarget({ kind: "document", id: doc.id, name: doc.name })
                          }
                          onDelete={() => setDeleteTarget({ kind: "document", id: doc.id, name: doc.name })}
                          onInfo={() => setSelectedKey({ kind: "document", id: doc.id })}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
                <DragOverlay>
                  {activeDragLabel ? (
                    <div className="-rotate-2 rounded-lg border border-primary bg-card px-4 py-2 text-sm font-medium shadow-glass-lg backdrop-blur-xl">
                      {activeDragLabel}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </>
          )}
        </div>

        {selectedItem && (
          <DetailPanel
            item={selectedItem}
            collapsed={panelCollapsed}
            onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
            onClose={() => setSelectedKey(null)}
            onDownload={
              selectedItem.kind === "document"
                ? () => handleDownload(selectedItem.data)
                : undefined
            }
            onPreview={
              selectedItem.kind === "document"
                ? () => handlePreview(selectedItem.data)
                : undefined
            }
            onEdit={
              selectedItem.kind === "document" &&
              officeEditorEnabled &&
              isEditableOffice(selectedItem.data.name)
                ? () => handleEdit(selectedItem.data)
                : undefined
            }
          />
        )}
      </div>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (name) => {
          await createFolderMutation.mutateAsync(name);
        }}
      />

      <RenameDialog
        key={renameTarget ? `${renameTarget.kind}-${renameTarget.id}` : "none"}
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        currentName={renameTarget?.name ?? ""}
        onRename={async (name) => {
          if (!renameTarget) return;
          if (renameTarget.kind === "folder") {
            await renameFolderMutation.mutateAsync({ id: renameTarget.id, name });
          } else {
            await renameDocumentMutation.mutateAsync({ id: renameTarget.id, name });
          }
        }}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        name={deleteTarget?.name ?? ""}
        childCount={deleteTarget?.kind === "folder" ? deleteTarget.childCount : 0}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === "folder") {
            await deleteFolderMutation.mutateAsync(deleteTarget.id);
          } else {
            await deleteDocumentMutation.mutateAsync(deleteTarget.id);
          }
        }}
      />
    </div>
  );
};
