// node --test scripts/surface-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations, isExcluded } from "./surface-audit-lib.mjs";

const P = "src/pages/X.tsx";
const bad = (name, src, rule, path = P) =>
  test(`flags: ${name}`, () => {
    const v = findViolations(src, path);
    assert.ok(
      v.some((x) => x.rule === rule),
      `expected ${rule}, got ${JSON.stringify(v)}`
    );
  });
const ok = (name, src, path = P) =>
  test(`allows: ${name}`, () => assert.deepEqual(findViolations(src, path), []));

bad("bg-white", `<div className="bg-white p-2" />`, "STRAY-FILL");
bad("bg-white with opacity", `<div className="bg-white/80" />`, "STRAY-FILL");
bad("variant bg-white", `<div className="hover:bg-white" />`, "STRAY-FILL");
bad("bg-slate-100", `<div className="bg-slate-100" />`, "STRAY-FILL");
bad("text-gray-500", `<p className={cn("a", "text-gray-500")} />`, "STRAY-FILL");
bad("border-zinc-200 after a variant", `<div className="md:border-zinc-200" />`, "STRAY-FILL");
ok("text-white is a legitimate on-fill colour", `<span className="text-white" />`);
ok("bg-white-ish token name", `<div className="bg-white-glow" />`);
ok("bg-card", `<div className="bg-card" />`);

bad("dark:bg", `<div className="bg-card dark:bg-muted" />`, "DARK-OVERRIDE");
bad("dark:text", `<p className="text-foreground dark:text-muted-foreground" />`, "DARK-OVERRIDE");
bad("dark:border", `<p className="dark:border-line-subtle" />`, "DARK-OVERRIDE");
bad("dark:hover:bg chain", `<p className="dark:hover:bg-muted" />`, "DARK-OVERRIDE");
bad("sm:dark:text chain", `<p className="sm:dark:text-muted-foreground" />`, "DARK-OVERRIDE");
bad(
  "dark: after => handler",
  `<a onClick={() => go()} className="dark:bg-black" />`,
  "DARK-OVERRIDE"
);
bad("dark: on its own cn() line", `cn(\n  "a",\n  "dark:text-sky-300"\n)`, "DARK-OVERRIDE");
ok("dark:shadow is not a colour override", `<div className="dark:shadow-none" />`);
ok("dark:hidden", `<div className="dark:hidden" />`);
ok("a comment mentioning the pattern", ` * \`text-rose-700 dark:text-rose-400\` is the old way`);

bad("text-[10px]", `<span className="text-[10px]" />`, "MICRO-TEXT");
bad("text-[11px]", `<span className="text-[11px]" />`, "MICRO-TEXT");
bad("variant sm:text-[10px]", `<span className="sm:text-[10px]" />`, "MICRO-TEXT");
bad("decimal text-[10.5px]", `<span className="text-[10.5px]" />`, "MICRO-TEXT");
ok("text-xs", `<span className="text-xs" />`);
ok("text-[12px]", `<span className="text-[12px]" />`);
ok("text-[110px]", `<span className="text-[110px]" />`);

ok(
  "allow-listed identity colours",
  `x("bg-slate-100 dark:bg-slate-800")`,
  "src/plugins/organigrama/components/OrgNode.tsx"
);
bad(
  "allow-list is per rule: OrgNode may not use micro-text",
  `<i className="text-[10px]" />`,
  "MICRO-TEXT",
  "src/plugins/organigrama/components/OrgNode.tsx"
);
ok(
  "allow-listed count badge",
  `<i className="text-[10px]" />`,
  "src/components/layout/SidebarNavLink.tsx"
);
ok(
  "Windows path separators still match the allow-list",
  `<i className="text-[10px]" />`,
  "src\\components\\layout\\SidebarNavLink.tsx"
);

test("isExcluded prefix match", () => {
  assert.equal(isExcluded("src/plugins/engagement/a.tsx", ["src/plugins/engagement"]), true);
  assert.equal(isExcluded("src/plugins/engagement2/a.tsx", ["src/plugins/engagement"]), false);
});
