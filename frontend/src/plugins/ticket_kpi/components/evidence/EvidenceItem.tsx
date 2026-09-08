import React, { memo, useMemo, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
  Trash2,
  Mail,
  FileText,
  Image,
  Award,
  HelpCircle,
  Download,
  Loader2,
} from "lucide-react";
import { EvidenceStatusBadge } from "./EvidenceStatusBadge";
import { formatMonthLabel } from "@/lib/monthOptions";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { KPIEvidence } from "../../types/ticketKPI";

interface EvidenceItemProps {
  item: KPIEvidence;
  canReview: boolean;
  processingId?: number;
  onReview: (id: number, status: "approved" | "rejected") => void;
  onUnreview: (id: number) => void;
  onDelete: (id: number) => void;
  onViewEmail: (item: KPIEvidence) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  document: <FileText className="h-4 w-4" />,
  certificate: <Award className="h-4 w-4" />,
  email_thread: <Mail className="h-4 w-4" />,
  screenshot: <Image className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
};

// Extensions that browsers can render inline (open in a tab).
const BROWSER_VIEWABLE = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "txt",
  "html",
  "htm",
  "csv",
]);

const getExtension = (fileName?: string | null): string => {
  if (!fileName) return "";
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const EvidenceItem = memo(function EvidenceItem({
  item,
  canReview,
  processingId,
  onReview,
  onUnreview,
  onDelete,
  onViewEmail,
}: EvidenceItemProps) {
  const isProcessing = processingId === item.id;
  const [isFileLoading, setIsFileLoading] = useState(false);

  const isEmailThread = useMemo(
    () =>
      item.evidence_type === "email_thread" ||
      item.file?.toLowerCase().endsWith(".eml") ||
      item.file?.toLowerCase().endsWith(".msg"),
    [item.evidence_type, item.file]
  );

  const title = useMemo(() => item.evidence_type.replaceAll("_", " "), [item.evidence_type]);

  const handleApprove = useCallback(() => onReview(item.id, "approved"), [onReview, item.id]);
  const handleReject = useCallback(() => onReview(item.id, "rejected"), [onReview, item.id]);
  const handleUnreview = useCallback(() => onUnreview(item.id), [onUnreview, item.id]);
  const handleDelete = useCallback(() => onDelete(item.id), [onDelete, item.id]);
  const handleViewEmail = useCallback(() => onViewEmail(item), [onViewEmail, item]);

  const handleOpenFile = useCallback(async () => {
    if (!item.file) return;
    const ext = getExtension(item.file_name ?? item.file);
    const isViewable = BROWSER_VIEWABLE.has(ext);

    setIsFileLoading(true);
    try {
      const blob = await ticketKPIService.downloadEvidenceFile(item.id);
      const url = window.URL.createObjectURL(blob);

      if (isViewable) {
        // Open browser-viewable files (PDF, images, HTML, text) in a new tab
        window.open(url, "_blank", "noopener,noreferrer");
        // Revoke after a delay so the tab has time to load the content
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      } else {
        // Trigger download for office docs, email files, etc.
        const a = document.createElement("a");
        a.href = url;
        a.download = item.file_name ?? item.file ?? `evidence_${item.id}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch {
      // Silently fail — the toast is handled by the API interceptor
    } finally {
      setIsFileLoading(false);
    }
  }, [item.id, item.file, item.file_name]);

  const fileButtonIcon = isFileLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : BROWSER_VIEWABLE.has(getExtension(item.file_name ?? item.file)) ? (
    <Eye className="h-4 w-4" />
  ) : (
    <Download className="h-4 w-4" />
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {typeIcons[item.evidence_type] || typeIcons.other}
            </span>
            <CardTitle className="text-sm font-medium capitalize">{title}</CardTitle>
            <EvidenceStatusBadge status={item.status} />
          </div>
          <div className="flex items-center gap-1">
            {item.file && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleOpenFile}
                disabled={isFileLoading}
                aria-label="Open file"
              >
                {fileButtonIcon}
              </Button>
            )}
            {isEmailThread && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleViewEmail}
                aria-label="View email thread"
              >
                <Mail className="h-4 w-4" />
              </Button>
            )}
            {canReview && item.status !== "approved" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleApprove}
                disabled={isProcessing}
                aria-label="Approve evidence"
              >
                <CheckCircle className="h-4 w-4 text-green-600" />
              </Button>
            )}
            {canReview && item.status !== "rejected" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleReject}
                disabled={isProcessing}
                aria-label="Reject evidence"
              >
                <XCircle className="h-4 w-4 text-destructive" />
              </Button>
            )}
            {canReview && item.status !== "pending" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleUnreview}
                disabled={isProcessing}
                aria-label="Reset evidence to pending"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDelete}
              disabled={isProcessing}
              aria-label="Delete evidence"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        <p className="text-xs text-muted-foreground">
          {formatMonthLabel(item.month)} · {item.username || "Unknown"}
          {item.reviewed_by_username && ` · reviewed by ${item.reviewed_by_username}`}
        </p>
        {item.description && <p className="text-sm text-foreground">{item.description}</p>}
        {item.clients && item.clients.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.clients.map((client) => (
              <Badge key={client.id} variant="outline" className="text-[10px]">
                {client.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
