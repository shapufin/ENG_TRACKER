import React, { lazy } from "react";

// This file serves as a registry for all frontend plugin components.
// When a plugin is implemented, its components should be registered here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLUGIN_COMPONENTS: Record<string, Record<string, React.LazyExoticComponent<any>>> = {
  notifications: {
    NotificationBell: lazy(() => import("./notifications/components/NotificationBell")),
    NotificationsPage: lazy(() =>
      import("./notifications/pages/NotificationsPage").then((m) => ({
        default: m.NotificationsPage,
      }))
    ),
  },
  analytics: {
    AnalyticsPage: lazy(() =>
      import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage }))
    ),
    AnalyticsSidebarItem: lazy(() => import("./analytics/components/AnalyticsSidebarItem")),
    AnalyticsAdminSidebarItem: lazy(
      () => import("./analytics/components/AnalyticsAdminSidebarItem")
    ),
  },
  audit_log: {
    AuditLogPage: lazy(() =>
      import("@/pages/admin/AuditLogsEnhancedPage").then((m) => ({
        default: m.AuditLogsEnhancedPage,
      }))
    ),
    AuditLogSidebarItem: lazy(() => import("./audit_log/components/AuditLogSidebarItem")),
  },
  ticket_kpi: {
    TicketUploadPage: lazy(() =>
      import("./ticket_kpi/pages/TicketUploadPage").then((m) => ({ default: m.TicketUploadPage }))
    ),
    TicketKPIDashboardPage: lazy(() =>
      import("./ticket_kpi/pages/TicketKPIDashboardPage").then((m) => ({
        default: m.TicketKPIDashboardPage,
      }))
    ),
    TicketKPITeamPage: lazy(() =>
      import("./ticket_kpi/pages/TicketKPITeamPage").then((m) => ({ default: m.TicketKPITeamPage }))
    ),
    TicketKPITeamManagementPage: lazy(() =>
      import("./ticket_kpi/pages/TicketKPITeamManagementPage").then((m) => ({
        default: m.TicketKPITeamManagementPage,
      }))
    ),
    TicketKPIAdminPage: lazy(() =>
      import("./ticket_kpi/pages/TicketKPIAdminPage").then((m) => ({
        default: m.TicketKPIAdminPage,
      }))
    ),
    TicketLinkSection: lazy(() =>
      import("./ticket_kpi/components/links/TicketLinkSection").then((m) => ({
        default: m.TicketLinkSection,
      }))
    ),
    AutoMatchReview: lazy(() =>
      import("./ticket_kpi/components/links/AutoMatchReview").then((m) => ({
        default: m.AutoMatchReview,
      }))
    ),
  },
  data_import: {
    DataImportPage: lazy(() =>
      import("./data_import/pages/DataImportPage").then((m) => ({ default: m.DataImportPage }))
    ),
    // Consumed by core admin pages through PluginImportButton, never imported
    // directly, so removing the plugin cannot break their build.
    ImportPageButton: lazy(() =>
      import("./data_import/components/ImportPageButton").then((m) => ({
        default: m.ImportPageButton,
      }))
    ),
  },
  control_room: {
    ControlRoomDashboardPage: lazy(() =>
      import("./control_room/pages/ControlRoomDashboardPage").then((m) => ({
        default: m.ControlRoomDashboardPage,
      }))
    ),
    ControlRoomAccessPage: lazy(() =>
      import("./control_room/pages/ControlRoomAccessPage").then((m) => ({
        default: m.ControlRoomAccessPage,
      }))
    ),
    ControlRoomSidebarItem: lazy(() => import("./control_room/components/ControlRoomSidebarItem")),
    ControlRoomAdminSidebarItem: lazy(
      () => import("./control_room/components/ControlRoomAdminSidebarItem")
    ),
  },
  payroll: {
    PayrollRunsPage: lazy(() =>
      import("./payroll/pages/PayrollRunsPage").then((m) => ({ default: m.PayrollRunsPage }))
    ),
    PayrollRunDetailPage: lazy(() =>
      import("./payroll/pages/PayrollRunDetailPage").then((m) => ({
        default: m.PayrollRunDetailPage,
      }))
    ),
    PayrollWagesPage: lazy(() =>
      import("./payroll/pages/PayrollWagesPage").then((m) => ({ default: m.PayrollWagesPage }))
    ),
    PayrollCalendarPage: lazy(() =>
      import("./payroll/pages/PayrollCalendarPage").then((m) => ({
        default: m.PayrollCalendarPage,
      }))
    ),
    PayrollSettingsPage: lazy(() =>
      import("./payroll/pages/PayrollSettingsPage").then((m) => ({
        default: m.PayrollSettingsPage,
      }))
    ),
  },
  organigrama: {
    OrganigramaPage: lazy(() =>
      import("./organigrama/pages/OrganigramaPage").then((m) => ({ default: m.OrganigramaPage }))
    ),
    OrganigramaAdminPage: lazy(() =>
      import("./organigrama/pages/OrganigramaAdminPage").then((m) => ({
        default: m.OrganigramaAdminPage,
      }))
    ),
    OrganigramaBuilderPage: lazy(() =>
      import("./organigrama/pages/OrganigramaBuilderPage").then((m) => ({
        default: m.OrganigramaBuilderPage,
      }))
    ),
    OrganigramaPublishPage: lazy(() =>
      import("./organigrama/pages/OrganigramaPublishPage").then((m) => ({
        default: m.OrganigramaPublishPage,
      }))
    ),
    OrganigramaSidebarItem: lazy(() => import("./organigrama/components/OrganigramaSidebarItem")),
  },
  skills: {
    MySkillsPage: lazy(() =>
      import("./skills/pages/MySkillsPage").then((m) => ({ default: m.MySkillsPage }))
    ),
    SkillsTeamPage: lazy(() =>
      import("./skills/pages/SkillsTeamPage").then((m) => ({ default: m.SkillsTeamPage }))
    ),
    SkillsCatalogPage: lazy(() =>
      import("./skills/pages/SkillsCatalogPage").then((m) => ({
        default: m.SkillsCatalogPage,
      }))
    ),
    SkillsHistoryPage: lazy(() =>
      import("./skills/pages/SkillsHistoryPage").then((m) => ({
        default: m.SkillsHistoryPage,
      }))
    ),
    SkillsSidebarItem: lazy(() => import("./skills/components/SkillsSidebarItem")),
  },
};

export const getPluginComponent = (pluginName: string, componentName: string) => {
  return PLUGIN_COMPONENTS[pluginName]?.[componentName] || null;
};
