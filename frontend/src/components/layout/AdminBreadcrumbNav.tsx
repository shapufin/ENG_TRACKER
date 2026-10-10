import React from "react";
import { Link, useLocation } from "react-router-dom";
import type { AdminNavItem } from "./hooks/useAdminNavItems";
import { resolveAdminCrumbs } from "./adminBreadcrumbs";

export const AdminBreadcrumbNav: React.FC<{ items: AdminNavItem[] }> = ({ items }) => {
  const { pathname } = useLocation();
  const crumbs = resolveAdminCrumbs(pathname, items);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${crumb.label}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-foreground" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
