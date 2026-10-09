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
  "src/plugins/notifications/components/NotificationBell.tsx"
);
ok(
  "Windows path separators still match the allow-list",
  `<i className="text-[10px]" />`,
  "src\\plugins\\notifications\\components\\NotificationBell.tsx"
);

bad("text-[9px]", `<span className="text-[9px]" />`, "MICRO-TEXT");
bad("text-[8.5px]", `<span className="text-[8.5px]" />`, "MICRO-TEXT");
bad(
  "text-[9.5px] behind a variant chain",
  `<span className="md:hover:text-[9.5px]" />`,
  "MICRO-TEXT"
);
bad("text-[0.6rem]", `<span className="text-[0.6rem]" />`, "MICRO-TEXT");
bad("text-[0.7rem]", `<span className="text-[0.7rem]" />`, "MICRO-TEXT");
bad("text-[0.625rem]", `<span className="text-[0.625rem]" />`, "MICRO-TEXT");
bad("text-micro", `<span className="text-micro text-muted-foreground" />`, "MICRO-TEXT");
bad("text-micro-lg", `<span className="font-mono text-micro-lg" />`, "MICRO-TEXT");
bad("sm:text-micro", `<span className="sm:text-micro" />`, "MICRO-TEXT");
bad("text-micro inside cn()", `cn("a", flag && "text-micro")`, "MICRO-TEXT");
ok("text-[0.75rem]", `<span className="text-[0.75rem]" />`);
ok("text-[12px]", `<span className="text-[12px]" />`);
ok("text-microscope is not the token", `<span className="text-microscope" />`);

bad("dark:ring", `<div className="ring-1 dark:ring-white/10" />`, "DARK-EXTRA");
bad("dark:from gradient", `<div className="dark:from-slate-900" />`, "DARK-EXTRA");
bad("dark:stroke behind a variant", `<path className="dark:hover:stroke-white" />`, "DARK-EXTRA");
bad("dark:shadow-lg", `<div className="dark:shadow-lg" />`, "DARK-EXTRA");
bad("dark:divide", `<div className="dark:divide-white/5" />`, "DARK-EXTRA");
ok("dark:shadow-none", `<div className="dark:shadow-none" />`);
ok(
  "allow-listed identity ring",
  `x("dark:ring-white/10")`,
  "src/components/calendar/CalendarDayCell.tsx"
);

test("RAW-PALETTE is opt-in", () => {
  const src = `<div className="bg-amber-500/10 text-emerald-400 border-sky-300 hover:bg-rose-500" />`;
  assert.deepEqual(findViolations(src, P), []);
  const v = findViolations(src, P, undefined, { rawPalette: true });
  assert.equal(v.filter((x) => x.rule === "RAW-PALETTE").length, 1); // one finding per line
});
test("RAW-PALETTE flags each palette family when enabled", () => {
  for (const c of [
    "red",
    "blue",
    "green",
    "orange",
    "yellow",
    "purple",
    "violet",
    "indigo",
    "teal",
    "cyan",
    "pink",
    "fuchsia",
    "lime",
    "stone",
    "neutral",
  ]) {
    const v = findViolations(`<i className="sm:text-${c}-600" />`, P, undefined, {
      rawPalette: true,
    });
    assert.ok(
      v.some((x) => x.rule === "RAW-PALETTE"),
      c
    );
  }
});
test("RAW-PALETTE ignores tone tokens", () => {
  const src = `<i className="bg-tone-warning-surface text-red text-primary border-border" />`;
  assert.deepEqual(findViolations(src, P, undefined, { rawPalette: true }), []);
});

test("isExcluded prefix match", () => {
  assert.equal(isExcluded("src/plugins/engagement/a.tsx", ["src/plugins/engagement"]), true);
  assert.equal(isExcluded("src/plugins/engagement2/a.tsx", ["src/plugins/engagement"]), false);
});
