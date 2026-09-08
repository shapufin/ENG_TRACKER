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
import { OvertimePage } from "@/pages/overtime/OvertimePage";
import { StandbyPage } from "@/pages/standby/StandbyPage";
import { LeavePage } from "@/pages/leave_management/LeavePage";
const CalendarPage = React.lazy(() => import("@/pages/calendar/CalendarPage"));
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { TeamsPage } from "@/pages/admin/TeamsPage";
import { TechsPage } from "@/pages/admin/TechsPage";
import { ClientsPage } from "@/pages/admin/ClientsPage";
import { ResourceAccessPage } from "@/pages/admin/ResourceAccessPage";
import { ResourceAccessGroupPage } from "@/pages/admin/ResourceAccessGroupPage";
import { CalendarManagementPage } from "@/pages/admin/CalendarManagementPage";
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
import { LeaveBalancesPage } from "@/pages/admin/LeaveBalancesPage";
import { GlobalSettingsPage } from "@/pages/admin/GlobalSettingsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
const TeamManagementPage = React.lazy(() => import("@/pages/team/TeamManagementPage"));
import TLApprovalDashboard from "@/pages/team/TLApprovalDashboard";
import { HRRoute } from "@/components/auth/HRRoute";
import { TLRoute } from "@/components/auth/TLRoute";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageLoader } from "@/components/ui/PageLoader";
import { usePlugins } from "@/context/PluginContext";
import { getPluginComponent } from "@/plugins";
import { PluginManagementPage } from "@/pages/admin/PluginManagementPage";

const withErrorBoundary = (element: React.ReactNode) => <ErrorBoundary>{element}</ErrorBoundary>;

const withSuspense = (element: React.ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>{element}</Suspense>
  </ErrorBoundary>
);

const usePluginRouteObjects = (layout: "app" | "admin") => {
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
                { path: "/overtime", element: withErrorBoundary(<OvertimePage />) },
                { path: "/standby", element: withErrorBoundary(<StandbyPage />) },
                { path: "/leave-management", element: withErrorBoundary(<LeavePage />) },
                { path: "/calendar", element: withSuspense(<CalendarPage />) },
                { path: "/team", element: withSuspense(<TeamManagementPage />) },
                {
                  element: <TLRoute />,
                  children: [
                    {
                      path: "/team/approvals",
                      element: withErrorBoundary(<TLApprovalDashboard />),
                    },
                  ],
                },
                {
                  element: <HRRoute />,
                  children: [{ path: "/hr/reports", element: withSuspense(<HRReportsPage />) }],
                },
              ],
            },
            { path: "/settings", element: withErrorBoundary(<SettingsPage />) },
            ...appPluginRoutes,
          ],
        },
        {
          element: <SuperuserRoute />,
          children: [
            {
              element: <AdminShell />,
              children: [
                { path: "/admin", element: withErrorBoundary(<AdminDashboardPage />) },
                { path: "/admin/users", element: withErrorBoundary(<UsersPage />) },
                { path: "/admin/teams", element: withErrorBoundary(<TeamsPage />) },
                { path: "/admin/techs", element: withErrorBoundary(<TechsPage />) },
                { path: "/admin/clients", element: withErrorBoundary(<ClientsPage />) },
                {
                  path: "/admin/resource-access",
                  element: withErrorBoundary(<ResourceAccessPage />),
                },
                {
                  path: "/admin/resource-access/groups/:groupId",
                  element: withErrorBoundary(<ResourceAccessGroupPage />),
                },
                { path: "/admin/reports", element: withSuspense(<ReportsPage />) },
                {
                  path: "/admin/calendars",
                  element: withErrorBoundary(<CalendarManagementPage />),
                },
                {
                  path: "/admin/leave-balances",
                  element: withErrorBoundary(<LeaveBalancesPage />),
                },
                {
                  path: "/admin/global-settings",
                  element: withErrorBoundary(<GlobalSettingsPage />),
                },
                { path: "/admin/overtime-logs", element: withSuspense(<OvertimeLogsPage />) },
                { path: "/admin/standby-logs", element: withSuspense(<StandbyLogsPage />) },
                { path: "/admin/leave-requests", element: withSuspense(<LeaveRequestsPage />) },
                { path: "/admin/plugins", element: withErrorBoundary(<PluginManagementPage />) },
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
