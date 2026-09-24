import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Eye,
  File as FileIcon,
  Folder as FolderIcon,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatDateTime } from "@/lib/date-format-utils";
import { useMotionTransition } from "@/lib/motion";
import { isEditableOffice } from "../lib/officeFiles";
import type { Document, Folder } from "../types/onboarding";

export type DetailPanelItem =
  | { kind: "folder"; data: Folder }
  | { kind: "document"; data: Document };

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Only PDFs render natively in a browser tab. Word/Excel/images have no
 * built-in in-browser viewer here yet — download remains the only option
 * for those until an office-document viewer is wired up. */
const isPreviewable = (name: string): boolean => name.toLowerCase().endsWith(".pdf");

const MetaRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 py-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="truncate font-medium">{value}</span>
  </div>
);

const NamedValue: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex items-center gap-1">
    <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    {name}
  </span>
);

/** Shared "Last modified" rows for both folder and document — shows the
 * editor's name when the item has actually been edited since creation
 * (`updated_by_name`), falling back to a bare timestamp when it hasn't. */
const LastModifiedRows: React.FC<{ updatedByName: string | null; updatedAt: string }> = ({
  updatedByName,
  updatedAt,
}) => (
  <>
    <MetaRow
      label="Last modified"
      value={updatedByName ? <NamedValue name={updatedByName} /> : formatDateTime(updatedAt) || "—"}
    />
    {updatedByName && <MetaRow label="Modified on" value={formatDateTime(updatedAt) || "—"} />}
  </>
);

interface DetailPanelProps {
  item: DetailPanelItem;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  onEdit?: () => void;
}

/** Drive-style right-side inspector for the selected tile: creator, size,
 * last-modified timestamp. Fixed slide-over below `sm`, inline aside at
 * `sm` and above (matches the repo's 320px-layout baseline). */
export const DetailPanel: React.FC<DetailPanelProps> = ({
  item,
  collapsed,
  onToggleCollapsed,
  onClose,
  onDownload,
  onPreview,
  onEdit,
}) => {
  const slideTransition = useMotionTransition({ duration: 0.2, ease: "easeOut" });
  const isFolder = item.kind === "folder";
  const name = item.data.name;

  if (collapsed) {
    return (
      <div className="hidden shrink-0 sm:block">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Expand details panel"
          onClick={onToggleCollapsed}
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 sm:hidden"
        aria-hidden="true"
        onClick={onClose}
      />
      <AnimatePresence>
        <motion.aside
          key={`${item.kind}-${item.data.id}`}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={slideTransition}
          aria-label="Item details"
          className="fixed inset-y-0 right-0 z-40 w-full max-w-xs sm:static sm:z-auto sm:w-72 sm:max-w-none sm:shrink-0"
        >
          <GlassCard animateOnMount={false} isHoverLift={false} className="h-full overflow-y-auto p-4 sm:h-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Details
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-7 w-7 sm:inline-flex"
                  aria-label="Collapse details panel"
                  onClick={onToggleCollapsed}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Close details panel"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-inner"
                style={{
                  background: isFolder
                    ? "linear-gradient(135deg, hsl(var(--chart-1) / 0.28), hsl(var(--chart-1) / 0.08))"
                    : "linear-gradient(135deg, hsl(var(--chart-2) / 0.28), hsl(var(--chart-2) / 0.08))",
                }}
              >
                {isFolder ? (
                  <FolderIcon className="h-5 w-5 text-chart-1" aria-hidden="true" />
                ) : (
                  <FileIcon className="h-5 w-5 text-chart-2" aria-hidden="true" />
                )}
              </div>
              <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
            </div>

            <div className="divide-y divide-border/50">
              {item.kind === "folder" ? (
                <>
                  <MetaRow
                    label="Contents"
                    value={`${item.data.child_count} folder${item.data.child_count === 1 ? "" : "s"}, ${item.data.document_count} file${item.data.document_count === 1 ? "" : "s"}`}
                  />
                  <MetaRow
                    label="Created by"
                    value={item.data.created_by_name ? <NamedValue name={item.data.created_by_name} /> : "—"}
                  />
                  <MetaRow label="Created" value={formatDateTime(item.data.created_at) || "—"} />
                  <LastModifiedRows
                    updatedByName={item.data.updated_by_name}
                    updatedAt={item.data.updated_at}
                  />
                </>
              ) : (
                <>
                  <MetaRow label="Size" value={formatBytes(item.data.size_bytes)} />
                  <MetaRow
                    label="Uploaded by"
                    value={item.data.uploaded_by_name ? <NamedValue name={item.data.uploaded_by_name} /> : "—"}
                  />
                  <MetaRow label="Uploaded" value={formatDateTime(item.data.created_at) || "—"} />
                  <LastModifiedRows
                    updatedByName={item.data.updated_by_name}
                    updatedAt={item.data.updated_at}
                  />
                </>
              )}
            </div>

            {item.kind === "document" && (onDownload || onPreview || onEdit) && (
              <div className="mt-4 flex gap-2">
                {onEdit && isEditableOffice(item.data.name) && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                )}
                {onPreview && isPreviewable(item.data.name) && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={onPreview}>
                    <Eye className="mr-2 h-4 w-4" /> Preview
                  </Button>
                )}
                {onDownload && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={onDownload}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                )}
              </div>
            )}
          </GlassCard>
        </motion.aside>
      </AnimatePresence>
    </>
  );
};
