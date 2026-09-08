import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { PluginPermissionGuard } from "@/components/auth/PluginPermissionGuard";
import { AnalyticsConfigModal } from "@/components/analytics/AnalyticsConfigModal";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { AnalyticsHotspots } from "@/components/analytics/AnalyticsHotspots";
import { AnalyticsInsights } from "@/components/analytics/AnalyticsInsights";
import { AnalyticsMetrics } from "@/components/analytics/AnalyticsMetrics";
import { AnalyticsTrendCharts } from "@/components/analytics/AnalyticsTrendCharts";
import { AnalyticsControls } from "@/components/analytics/AnalyticsControls";
import { ScheduledReportsPanel } from "@/components/analytics/ScheduledReportsPanel";
import { ReportsPanel } from "@/components/analytics/ReportsPanel";
import { Download } from "lucide-react";
import { useAnalyticsPage } from "./hooks/useAnalyticsPage";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { exportAnalytics } from "@/lib/export-analytics";
import { useQueryClient } from "@tanstack/react-query";

export const AnalyticsPage: React.FC = () => {
  const { canManage, canExport } = usePluginPermissions();
  const queryClient = useQueryClient();
  const {
    PERIODS,
    selectedPeriod,
    setSelectedPeriod,
    dateRange,
    setDateRange,
    selectedTeams,
    setSelectedTeams,
    selectedUsers,
    setSelectedUsers,
    selectedStatuses,
    setSelectedStatuses,
    selectedCategories,
    setSelectedCategories,
    exportFormat,
    setExportFormat,
    configModalOpen,
    setConfigModalOpen,
    showFilters,
    setShowFilters,
    teams,
    usersList,
    analytics,
    isLoading,
    error,
    hotspotsData,
    trends,
    insights,
    insightsLoading,
    activeFilterCount,
    clearFilters,
  } = useAnalyticsPage();

  const handleExport = canExport("analytics")
    ? () =>
        exportAnalytics(
          selectedPeriod,
          dateRange,
          selectedTeams,
          selectedUsers,
          selectedStatuses,
          selectedCategories,
          exportFormat
        )
    : undefined;

  return (
    <PluginPermissionGuard pluginName="analytics" action="view">
      <PageShell
        title="Analytics Dashboard"
        subtitle="Business Intelligence & Operational Insights"
        actions={
          handleExport ? (
            <Button className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6">
          <AnalyticsControls
            periods={PERIODS}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            activeFilterCount={activeFilterCount}
            exportFormat={exportFormat}
            onExportFormatChange={setExportFormat}
            onExport={handleExport}
            onOpenSettings={canManage("analytics") ? () => setConfigModalOpen(true) : undefined}
          />

          <AnalyticsFilters
            show={showFilters}
            teams={teams}
            users={usersList}
            selectedTeams={selectedTeams}
            onTeamsChange={setSelectedTeams}
            selectedUsers={selectedUsers}
            onUsersChange={setSelectedUsers}
            selectedCategories={selectedCategories}
            onCategoryToggle={(cat, checked) =>
              setSelectedCategories((prev) =>
                checked ? [...prev, cat] : prev.filter((c) => c !== cat)
              )
            }
            selectedStatuses={selectedStatuses}
            onStatusToggle={(status, checked) =>
              setSelectedStatuses((prev) =>
                checked ? [...prev, status] : prev.filter((s) => s !== status)
              )
            }
            onClear={clearFilters}
            onClose={() => setShowFilters(false)}
          />

          <AnalyticsHotspots hotspots={hotspotsData} />

          <AnalyticsInsights insights={insights} isLoading={insightsLoading} />

          <AnalyticsMetrics
            metrics={analytics?.metrics}
            isLoading={isLoading}
            error={error as Error | null}
          />

          <AnalyticsTrendCharts trends={trends} period={selectedPeriod} />

          {canExport("analytics") && (
            <ReportsPanel
              currentFilters={{
                period: selectedPeriod,
                date_from: dateRange.from,
                date_to: dateRange.to,
                teams: selectedTeams,
                users: selectedUsers,
                statuses: selectedStatuses,
                categories: selectedCategories,
              }}
            />
          )}

          {canManage("analytics") && (
            <ScheduledReportsPanel
              currentFilters={{
                period: selectedPeriod,
                date_from: dateRange.from,
                date_to: dateRange.to,
                teams: selectedTeams,
                users: selectedUsers,
                statuses: selectedStatuses,
                categories: selectedCategories,
              }}
            />
          )}
        </div>
      </PageShell>
      {canManage("analytics") && (
        <AnalyticsConfigModal
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
          onSuccess={() => {
            // Invalidate analytics queries so insights refetch with new thresholds
            queryClient.invalidateQueries({ queryKey: ["analytics-insights"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }}
        />
      )}
    </PluginPermissionGuard>
  );
};
