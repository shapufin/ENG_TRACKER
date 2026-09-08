import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings, BarChart3, TestTube } from "lucide-react";
import { useTicketKPIAdmin } from "./hooks/useTicketKPIAdmin";
import { TicketKPIProfilesTab } from "../components/admin/TicketKPIProfilesTab";
import { TicketKPITestMappingTab } from "../components/admin/TicketKPITestMappingTab";
import { ProfileDialog } from "../components/admin/ProfileDialog";
import { ReportsSection } from "../components/admin/ReportsSection";

export const TicketKPIAdminPage: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    dialogOpen,
    setDialogOpen,
    editingProfile,
    profiles,
    clients,
    testFile,
    setTestFile,
    testProfileId,
    setTestProfileId,
    testResult,
    reportYear,
    setReportYear,
    createMutation,
    updateMutation,
    deleteMutation,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleTestMapping,
  } = useTicketKPIAdmin();

  return (
    <PageShell title="Ticket KPI Admin" subtitle="Manage export profiles and generate reports.">
      <div className="mx-auto max-w-5xl space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted">
            <TabsTrigger value="profiles">
              <Settings className="mr-2 h-4 w-4" /> Profiles
              {profiles && profiles.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {profiles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="test">
              <TestTube className="mr-2 h-4 w-4" /> Test Mapping
            </TabsTrigger>
            <TabsTrigger value="reports">
              <BarChart3 className="mr-2 h-4 w-4" /> Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="space-y-4">
            <TicketKPIProfilesTab
              profiles={profiles}
              clients={clients}
              onCreate={openCreateDialog}
              onEdit={openEditDialog}
              onDelete={deleteMutation.mutate}
            />
          </TabsContent>

          <TabsContent value="test" className="space-y-4">
            <TicketKPITestMappingTab
              profiles={profiles}
              testProfileId={testProfileId}
              onProfileChange={setTestProfileId}
              testFile={testFile}
              onFileChange={setTestFile}
              onTest={handleTestMapping}
              testResult={testResult}
            />
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <ReportsSection year={reportYear} onYearChange={setReportYear} />
          </TabsContent>
        </Tabs>
      </div>

      <ProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={editingProfile}
        clients={clients}
        onSave={handleSave}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </PageShell>
  );
};
