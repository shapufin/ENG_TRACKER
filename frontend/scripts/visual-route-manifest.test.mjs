// Phase 2 gate: canonical manifest contract tests (node --test).
// Run: node --test scripts/visual-route-manifest.test.mjs (from frontend/).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROUTES,
  REDIRECTS,
  GUARD_ONLY,
  ROLE_FIXTURES,
  DYNAMIC_FIXTURES,
  VIEWPORTS,
  THEMES,
  routesForRole,
  extractionDirFor,
  isDynamic,
  matrix,
} from "./visual-route-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTRACT_ROOT = path.join(REPO_ROOT, "design-audit", "app-extract-pages");

function quotedPaths(text, prefix) {
  // matches: path: "/x"  and  "path": "/x"
  const re = new RegExp(`${prefix}\\s*"?\\s*:\\s*"([^"]+)"`, "g");
  return [...text.matchAll(re)].map((m) => m[1]);
}

describe("visual-route-manifest contract", () => {
  it("every path is unique within a layout; every label is stable and filesystem-safe", () => {
    const seen = new Set();
    for (const r of ROUTES) {
      const key = `${r.layout} ${r.path}`;
      assert.ok(!seen.has(key), `duplicate route: ${key}`);
      seen.add(key);
      assert.match(r.label, /^[a-z0-9-]+$/, `unsafe label: ${r.label}`);
    }
    const labels = new Set(ROUTES.map((r) => r.label));
    assert.equal(labels.size, ROUTES.length, "labels must be unique");
  });

  it("canonical /skills exists and stale /skills/me does not (any field)", () => {
    const paths = ROUTES.map((r) => r.path);
    assert.ok(paths.includes("/skills"), "missing canonical /skills");
    const blob = JSON.stringify(ROUTES);
    assert.ok(!blob.includes("/skills/me"), "stale /skills/me present in manifest");
  });

  it("every static AppRoutes.tsx page route is represented or explicitly categorized", () => {
    const src = readFileSync(
      path.join(REPO_ROOT, "frontend", "src", "components", "routing", "AppRoutes.tsx"),
      "utf-8"
    );
    const declared = quotedPaths(src, "path").filter(
      (p) => p !== "*" && !p.includes(":") && !p.endsWith("/*")
    );
    const manifestPaths = new Set(ROUTES.map((r) => r.path));
    const redirectPaths = new Set(REDIRECTS.map((r) => r.path).filter((p) => !p.endsWith("/*")));
    for (const p of declared) {
      if (p === "/login") continue; // public route covered separately below
      assert.ok(
        manifestPaths.has(p) || redirectPaths.has(p),
        `AppRoutes path missing from manifest: ${p}`
      );
    }
    assert.ok(manifestPaths.has("/login"), "public /login missing from manifest");
    // dynamic core route categorized with a fixture resolver
    const dyn = ROUTES.find((r) => r.path === "/admin/resource-access/groups/:groupId");
    assert.ok(
      dyn && dyn.dynamicFixture === "resource-group",
      "group route needs resource-group fixture"
    );
  });

  it("every route declared by enabled plugin metadata is represented", () => {
    const pluginsDir = path.join(REPO_ROOT, "plugins");
    const manifestPaths = new Map(ROUTES.map((r) => [r.path, r]));
    for (const plugin of readdirSync(pluginsDir)) {
      const pluginPy = path.join(pluginsDir, plugin, "plugin.py");
      if (!existsSync(pluginPy)) continue;
      const src = readFileSync(pluginPy, "utf-8");
      for (const p of quotedPaths(src, '"path"')) {
        const entry = manifestPaths.get(p);
        assert.ok(entry, `plugin route missing from manifest: ${p} (${plugin})`);
        if (p.includes(":")) {
          assert.ok(
            entry.dynamicFixture && DYNAMIC_FIXTURES.includes(entry.dynamicFixture),
            `dynamic plugin route needs a fixture resolver, never a literal capture: ${p}`
          );
        }
      }
    }
  });

  it("every entry has roles, heading, layout, and mockup/extraction disposition", () => {
    for (const r of ROUTES) {
      assert.ok(r.roles.length > 0, `${r.path}: needs at least one role`);
      for (const role of r.roles) {
        assert.ok(
          ROLE_FIXTURES[role] && ROLE_FIXTURES[role] !== null,
          `${r.path}: role ${role} has no deterministic fixture`
        );
      }
      assert.ok(
        typeof r.expectedHeading === "string" || r.expectedHeading instanceof RegExp,
        `${r.path}: expectedHeading must be string|RegExp`
      );
      assert.ok(["app", "admin"].includes(r.layout), `${r.path}: bad layout`);
      assert.ok(
        typeof r.mockup === "string" && r.mockup.length > 0,
        `${r.path}: mockup disposition required`
      );
      assert.ok(
        typeof r.extraction === "string" && r.extraction.length > 0,
        `${r.path}: extraction disposition required`
      );
      if (isDynamic(r)) {
        assert.ok(
          r.dynamicFixture && DYNAMIC_FIXTURES.includes(r.dynamicFixture),
          `${r.path}: dynamic route must declare a fixture resolver`
        );
      }
    }
  });

  it("non-NONE extractions resolve to real app-extract-pages dirs; admin app-shell rows stay suspect", () => {
    for (const r of ROUTES.filter((x) => x.extraction !== "NONE")) {
      if (r.layout === "admin") {
        assert.ok(
          existsSync(path.join(EXTRACT_ROOT, "admin", r.extraction)),
          `${r.path}: missing admin extraction dir ${r.extraction}`
        );
      } else {
        const hits = r.roles
          .map((role) => extractionDirFor(r, role))
          .filter((d) => d && existsSync(path.join(EXTRACT_ROOT, d)));
        assert.ok(
          hits.length > 0,
          `${r.path}: no composed extraction dir exists for any visual role`
        );
        assert.equal(
          r.adminExtractionSuspect,
          true,
          `${r.path}: app-shell admin extraction must stay suspect until re-asserted`
        );
      }
    }
  });

  it("matrix generates exactly 4 theme/viewport combos per authorized route/role", () => {
    assert.deepEqual(Object.keys(VIEWPORTS), ["desktop", "mobile"]);
    assert.deepEqual(THEMES, ["dark", "light"]);
    const rows = matrix();
    const expected = ROUTES.reduce((n, r) => n + r.roles.length * 4, 0);
    assert.equal(rows.length, expected);
    const sample = rows.filter((x) => x.path === "/dashboard" && x.role === "tl");
    assert.equal(sample.length, 4);
  });

  it("redirects and guard-only rows cover the non-visual surface", () => {
    assert.ok(
      REDIRECTS.some((r) => r.path === "/"),
      "missing / redirect row"
    );
    assert.ok(
      REDIRECTS.some((r) => r.path === "/admin-dashboard/*" && r.to === "/admin"),
      "missing /admin-dashboard/* alias row"
    );
    // /team is NOT redirect-guarded (denial renders in place) — only
    // /team/approvals sits behind TLRoute.
    for (const p of ["/team/approvals", "/hr/reports", "/admin/*"]) {
      assert.ok(
        GUARD_ONLY.some((g) => g.path === p),
        `missing guard-only row for ${p}`
      );
    }
    assert.ok(
      ROUTES.find((r) => r.path === "/team").roles.includes("employee"),
      "/team must include employee (Access Denied variant)"
    );
    // Proven live 2026-09-05: non-admin @/analytics redirect (unregistered route).
    const analyticsGuard = GUARD_ONLY.find((g) => g.path === "/analytics");
    assert.ok(analyticsGuard, "missing guard-only row for /analytics");
    for (const role of ["employee", "tl", "tl_hr", "hr"]) {
      assert.ok(analyticsGuard.roles.includes(role), `/analytics guard must include ${role}`);
      assert.ok(
        !ROUTES.find((r) => r.path === "/analytics").roles.includes(role),
        `/analytics must not list ${role} as a visual role`
      );
    }
    assert.equal(analyticsGuard.expectRedirect, "/dashboard");
    // HR plugin-route + leave-requests/balances redirects (proven live 2026-09-05).
    for (const p of ["/admin/analytics", "/admin/payroll/runs", "/admin/data-import"]) {
      const row = GUARD_ONLY.find((g) => g.path === p);
      assert.ok(row, `missing guard-only row for ${p}`);
      assert.equal(row.expectRedirect, "/dashboard");
    }
    for (const p of ["/admin/leave-requests", "/admin/leave-balances"]) {
      const row = GUARD_ONLY.find((g) => g.path === p);
      assert.ok(row, `missing guard-only row for ${p}`);
      assert.deepEqual(row.roles, ["hr"]);
      assert.equal(row.expectRedirect, "/leave-management");
    }
  });

  it("routesForRole never emits stale or dynamic-literal captures", () => {
    for (const role of Object.keys(ROLE_FIXTURES)) {
      if (ROLE_FIXTURES[role] === null) continue;
      const blob = JSON.stringify(routesForRole(role));
      assert.ok(!blob.includes("/skills/me"), `${role}: stale /skills/me emitted`);
    }
  });
});
