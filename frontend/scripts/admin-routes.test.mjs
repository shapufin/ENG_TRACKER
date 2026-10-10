import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ROUTES } from "./admin-routes.mjs";

test("27 admin routes with unique slugs and ordered numbers", () => {
  assert.equal(ADMIN_ROUTES.length, 27);
  assert.ok(ADMIN_ROUTES.every((r) => r.path.startsWith("/admin")));
  assert.equal(new Set(ADMIN_ROUTES.map((r) => r.slug)).size, 27);
  ADMIN_ROUTES.forEach((r, i) => assert.equal(r.n, String(i + 1).padStart(2, "0")));
});

test("entries match INDEX.md", () => {
  const by = (s) => ADMIN_ROUTES.find((r) => r.slug === s);
  assert.equal(by("dashboard").path, "/admin");
  assert.equal(by("reports").path, "/admin/reports");
  assert.deepEqual(by("reports").tabs, ["OT & Standby", "Vacations"]);
  assert.deepEqual(by("data-import").tabs, ["Import", "History"]);
});
