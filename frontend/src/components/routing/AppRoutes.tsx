import React, { Suspense } from "react";
import { useRoutes, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SuperuserRoute } from "@/components/auth/SuperuserRoute";
import { CRUserGuard } from "@/components/auth/CRUserGuard";
import { HomeRedirect } from "@/components/routing/HomeRedirect";
import { AppShell } from "@/components/layout/AppShell";
import { AdminShell } from "@/components/layout/AdminShell";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
const OvertimePage = React.lazy(() =>
  import("@/pages/overtime/OvertimePage").then((m) => ({ default: m.OvertimePage }))
);
const StandbyPage = React.lazy(() =>
  import("@/pages/standby/StandbyPage").then((m) => ({ default: m.StandbyPage }))
);
const LeavePage = React.lazy(() =>
  import("@/pages/leave_management/LeavePage").then((m) => ({ default: m.LeavePage }))
);
const CalendarPage = React.lazy(() => import("@/pages/calendar/CalendarPage"));
const AdminDashboardPage = React.lazy(() =>
  import("@/pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage }))
);
const UsersPage = React.lazy(() =>
  import("@/pages/admin/UsersPage").then((m) => ({ default: m.UsersPage }))
);
const TeamsPage = React.lazy(() =>
  import("@/pages/admin/TeamsPage").then((m) => ({ default: m.TeamsPage }))
);
const TechsPage = React.lazy(() =>
  import("@/pages/admin/TechsPage").then((m) => ({ default: m.TechsPage }))
);
const ClientsPage = React.lazy(() =>
  import("@/pages/admin/ClientsPage").then((m) => ({ default: m.ClientsPage }))
);
const ResourceAccessPage = React.lazy(() =>
  import("@/pages/admin/ResourceAccessPage").then((m) => ({ default: m.ResourceAccessPage }))
);
const ResourceAccessGroupPage = React.lazy(() =>
  import("@/pages/admin/ResourceAccessGroupPage").then((m) => ({
    default: m.ResourceAccessGroupPage,
  }))
);
const CalendarManagementPage = React.lazy(() =>
  import("@/pages/admin/CalendarManagementPage").then((m) => ({
    default: m.CalendarManagementPage,
  }))
);
const ReportsPage = React.lazy(() =>
  import("@/pages/admin/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const OvertimeLogsPage = React.lazy(() => import("@/pages/admin/OvertimeLogsPage"));
const StandbyLogsPage = React.lazy(() => import("@/pages/admin/StandbyLogsPage"));
const LeaveRequestsPage = React.lazy(() =>
  import("@/pages/admin/LeaveRequestsPage").then((m) => ({ default: m.LeaveRequestsPage }))
);
const HRReportsPage = React.lazy(() =>
  import("@/pages/hr/HRReportsPage").then((m) => ({ default: m.HRReportsPage }))
);
const HRTeamLeaderAssignmentPage = React.lazy(
  () => import("@/pages/hr/HRTeamLeaderAssignmentPage")
);
const HRCalendarsPage = React.lazy(() => import("@/pages/hr/HRCalendarsPage"));
const HRTeamsPage = React.lazy(() => import("@/pages/hr/HRTeamsPage"));
const LeaveBalancesPage = React.lazy(() =>
  import("@/pages/admin/LeaveBalancesPage").then((m) => ({ default: m.LeaveBalancesPage }))
);
const GlobalSettingsPage = React.lazy(() =>
  import("@/pages/admin/GlobalSettingsPage").then((m) => ({ default: m.GlobalSettingsPage }))
);
const NotificationEventsPage = React.lazy(() =>
  import("@/pages/admin/NotificationEventsPage").then((m) => ({
    default: m.NotificationEventsPage,
  }))
);
const SettingsPage = React.lazy(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const TeamManagementPage = React.lazy(() => import("@/pages/team/TeamManagementPage"));
const TLApprovalDashboard = React.lazy(() => import("@/pages/team/TLApprovalDashboard"));
import { HRRoute } from "@/components/auth/HRRoute";
import { TLRoute } from "@/components/auth/TLRoute";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageLoader } from "@/components/ui/PageLoader";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";
const PluginManagementPage = React.lazy(() =>
  import("@/pages/admin/PluginManagementPage").then((m) => ({ default: m.PluginManagementPage }))
);

const withErrorBoundary = (element: React.ReactNode) => <ErrorBoundary>{element}</ErrorBoundary>;

const withSuspense = (element: React.ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>{element}</Suspense>
  </ErrorBoundary>
);

const usePluginRouteObjects = (layout: "app" | "admin" | "hr") => {
  const { activePlugins } = usePlugins();
  return activePlugins.flatMap((plugin) =>
    plugin.routes
      .filter((route) => route.layout === layout)
      .map((route) => {
        const Component = getPluginComponent(plugin.name, route.component);
        if (!Component) return null;
        return {
          path: route.path,
          element: withSuspense(<Component />),
        };
      })
      .filter((route): route is NonNullable<typeof route> => route !== null)
  );
};

export const AppRoutes: React.FC = () => {
  const { isLoading: pluginsLoading } = usePlugins();
  const appPluginRoutes = usePluginRouteObjects("app");
  const adminPluginRoutes = usePluginRouteObjects("admin");
  const hrPluginRoutes = usePluginRouteObjects("hr");

  // While plugin routes are loading, use a catch-all that shows a loader
  // instead of redirecting to /dashboard. Without this, a hard refresh on a
  // plugin route (e.g. /ticket-kpi/dashboard) hits the catch-all "*" →
  // Navigate to /dashboard before plugins are registered.
  const catchAll = pluginsLoading
    ? { path: "*", element: <PageLoader /> }
    : { path: "*", element: <HomeRedirect /> };

  return useRoutes([
    { path: "/login", element: <LoginPage /> },
    { path: "/", element: <HomeRedirect /> },
    { path: "/admin-dashboard/*", element: <Navigate to="/admin" replace /> },
    {
      element: <ProtectedRoute />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              element: <CRUserGuard />,
              children: [
                { path: "/dashboard", element: withErrorBoundary(<DashboardPage />) },
                { path: "/overtime", element: withSuspense(<OvertimePage />) },
                { path: "/standby", element: withSuspense(<StandbyPage />) },
                { path: "/leave-management", element: withSuspense(<LeavePage />) },
                { path: "/calendar", element: withSuspense(<CalendarPage />) },
                { path: "/team", element: withSuspense(<TeamManagementPage />) },
                {
                  element: <TLRoute />,
                  children: [
                    {
                      path: "/team/approvals",
                      element: withSuspense(<TLApprovalDashboard />),
                    },
                  ],
                },
                {
                  element: <HRRoute />,
                  children: [
                    { path: "/hr/reports", element: withSuspense(<HRReportsPage />) },
                    {
                      path: "/hr/team-leaders",
                      element: withSuspense(<HRTeamLeaderAssignmentPage />),
                    },
                    {
                      path: "/hr/calendars",
                      element: withSuspense(<HRCalendarsPage />),
                    },
                    {
                      path: "/hr/teams",
                      element: withSuspense(<HRTeamsPage />),
                    },
                    ...hrPluginRoutes,
                  ],
                },
              ],
            },
            { path: "/settings", element: withSuspense(<SettingsPage />) },
            ...appPluginRoutes,
          ],
        },
        {
          element: <SuperuserRoute />,
          children: [
            {
              element: <AdminShell />,
              children: [
                { path: "/admin", element: withSuspense(<AdminDashboardPage />) },
                { path: "/admin/users", element: withSuspense(<UsersPage />) },
                { path: "/admin/teams", element: withSuspense(<TeamsPage />) },
                { path: "/admin/techs", element: withSuspense(<TechsPage />) },
                { path: "/admin/clients", element: withSuspense(<ClientsPage />) },
                {
                  path: "/admin/resource-access",
                  element: withSuspense(<ResourceAccessPage />),
                },
                {
                  path: "/admin/resource-access/groups/:groupId",
                  element: withSuspense(<ResourceAccessGroupPage />),
                },
                { path: "/admin/reports", element: withSuspense(<ReportsPage />) },
                {
                  path: "/admin/calendars",
                  element: withSuspense(<CalendarManagementPage />),
                },
                {
                  path: "/admin/leave-balances",
                  element: withSuspense(<LeaveBalancesPage />),
                },
                {
                  path: "/admin/global-settings",
                  element: withSuspense(<GlobalSettingsPage />),
                },
                {
                  path: "/admin/notification-events",
                  element: withSuspense(<NotificationEventsPage />),
                },
                { path: "/admin/overtime-logs", element: withSuspense(<OvertimeLogsPage />) },
                { path: "/admin/standby-logs", element: withSuspense(<StandbyLogsPage />) },
                { path: "/admin/leave-requests", element: withSuspense(<LeaveRequestsPage />) },
                { path: "/admin/plugins", element: withSuspense(<PluginManagementPage />) },
                ...adminPluginRoutes,
              ],
            },
          ],
        },
      ],
    },
    catchAll,
  ]);
};
