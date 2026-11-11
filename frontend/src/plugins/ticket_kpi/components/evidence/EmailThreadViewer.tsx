import React, { useMemo } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { Mail, User, Calendar, Paperclip } from "lucide-react";
import type { EmailPreview } from "../../types/ticketKPI";

interface EmailThreadViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailPreview | undefined;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const EmailThreadViewer: React.FC<EmailThreadViewerProps> = ({
  open,
  onOpenChange,
  email,
  onRefresh,
  isLoading,
}) => {
  const safeBodyHtml = useMemo(() => sanitizeHtml(email?.body_html), [email?.body_html]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[80vh] sm:max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {email?.subject || "Email Thread"}
          </DialogTitle>
          <DialogDescription>Parsed email preview for this document.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoading && <p className="text-muted-foreground text-sm">Loading preview...</p>}

          {!isLoading && !email && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">No parsed preview available.</p>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  Try Parse
                </Button>
              )}
            </div>
          )}

          {email && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                {email.from && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />{" "}
                    <span className="text-foreground">{email.from}</span>
                  </p>
                )}
                {email.date && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />{" "}
                    <span>{new Date(email.date).toLocaleString()}</span>
                  </p>
                )}
                {email.to && email.to.length > 0 && (
                  <p className="text-muted-foreground text-xs">To: {email.to.join(", ")}</p>
                )}
                {email.cc && email.cc.length > 0 && (
                  <p className="text-muted-foreground text-xs">CC: {email.cc.join(", ")}</p>
                )}
              </div>

              {safeBodyHtml ? (
                <div
                  className="prose max-w-none text-sm break-words"
                  dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
                />
              ) : email.body_plain ? (
                <div className="bg-muted rounded-md p-3 text-sm break-words whitespace-pre-wrap">
                  {email.body_plain}
                </div>
              ) : null}

              {email.attachments && email.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Attachments</p>
                  <div className="flex flex-wrap gap-2">
                    {email.attachments.map((att, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs break-words"
                      >
                        <Paperclip className="h-3 w-3 shrink-0" />
                        {att.filename} ({(att.size / 1024).toFixed(1)} KB)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
