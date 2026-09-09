import React, { lazy, Suspense, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTicketKPIEvidence } from "../../pages/hooks/useTicketKPIEvidence";
import { EvidenceUploadForm } from "./EvidenceUploadForm";
import { EvidenceList } from "./EvidenceList";
import type { KPIEvidence } from "../../types/ticketKPI";

const EmailThreadViewer = lazy(() =>
  import("./EmailThreadViewer").then((m) => ({ default: m.EmailThreadViewer }))
);

interface TicketKPIEvidenceSectionProps {
  month: string;
  userId?: number;
}

export const TicketKPIEvidenceSection: React.FC<TicketKPIEvidenceSectionProps> = ({
  month,
  userId,
}) => {
  const { user } = useAuth();
  const {
    evidence,
    isLoading,
    canReview,
    availableClients,
    isUploadOpen,
    setIsUploadOpen,
    selectedType,
    setSelectedType,
    description,
    setDescription,
    file,
    setFile,
    selectedClientIds,
    handleClientToggle,
    createMutation,
    deleteMutation,
    reviewMutation,
    unreviewMutation,
  } = useTicketKPIEvidence({ month, userId });

  const [viewingEmail, setViewingEmail] = useState<KPIEvidence | null>(null);

  const isOwnView = !userId || userId === user?.id;
  const handleCreate = useCallback(() => {
    createMutation.mutate();
  }, [createMutation]);

  const handleReview = useCallback(
    (id: number, status: "approved" | "rejected") => {
      reviewMutation.mutate({ id, status });
    },
    [reviewMutation]
  );

  const handleUnreview = useCallback(
    (id: number) => {
      unreviewMutation.mutate(id);
    },
    [unreviewMutation]
  );

  const handleDelete = useCallback(
    (id: number) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const handleViewEmail = useCallback((item: KPIEvidence) => {
    setViewingEmail(item);
  }, []);

  const handleCloseEmail = useCallback(() => {
    setViewingEmail(null);
  }, []);

  const processingEvidenceId =
    (reviewMutation.isPending ? reviewMutation.variables?.id : undefined) ??
    (unreviewMutation.isPending ? unreviewMutation.variables : undefined) ??
    (deleteMutation.isPending ? deleteMutation.variables : undefined);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">KPI Evidence</CardTitle>
            {isOwnView && (
              <Button size="sm" onClick={() => setIsUploadOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Evidence
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <EvidenceList
            evidence={evidence}
            isLoading={isLoading}
            canReview={canReview}
            processingId={processingEvidenceId}
            onReview={handleReview}
            onUnreview={handleUnreview}
            onDelete={handleDelete}
            onViewEmail={handleViewEmail}
          />
        </CardContent>
      </Card>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Upload KPI Evidence</DialogTitle>
            <DialogDescription>
              Attach supporting documents, certificates, screenshots, or email threads for this
              month.
            </DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <EvidenceUploadForm
              month={month}
              availableClients={availableClients}
              selectedType={selectedType}
              onTypeChange={setSelectedType}
              description={description}
              onDescriptionChange={setDescription}
              file={file}
              onFileAccepted={setFile}
              selectedClientIds={selectedClientIds}
              onClientToggle={handleClientToggle}
              onSubmit={handleCreate}
              isPending={createMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <EmailThreadViewer
          open={!!viewingEmail}
          onOpenChange={handleCloseEmail}
          email={viewingEmail?.parsed_email}
        />
      </Suspense>
    </>
  );
};
