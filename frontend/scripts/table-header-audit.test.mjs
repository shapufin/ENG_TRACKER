// node --test scripts/table-header-audit.test.mjs
// Every case below is an evasion that once slipped past (or could slip past) the audit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "./table-header-audit-lib.mjs";

const thead = (th) => `const a=(<table><thead><tr>${th}</tr></thead></table>);`;
const bad = (name, src) =>
  test(`flags: ${name}`, () => assert.ok(findViolations(src).length > 0, "expected a violation"));
const ok = (name, src) => test(`allows: ${name}`, () => assert.deepEqual(findViolations(src), []));

bad("bare bg-muted", thead('<th className="bg-muted">x</th>'));
bad("bg-card/50", thead('<th className="bg-card/50">x</th>'));
bad("bg-secondary / bg-accent / bg-background", thead('<th className="bg-secondary">x</th>'));
bad("tracking-wide", thead('<th className="tracking-wide">x</th>'));
bad("tracking-tight", thead('<th className="tracking-tight">x</th>'));
bad("text-sm", thead('<th className="text-sm">x</th>'));
bad("text-[12px]", thead('<th className="text-[12px]">x</th>'));
bad("font-normal", thead('<th className="font-normal">x</th>'));
bad("capitalize", thead('<th className="capitalize">x</th>'));
bad(
  "arbitrary variant hiding uppercase after a >",
  thead('<th className="[&>span]:uppercase">x</th>')
);
bad("uppercase inside cn()", thead('<th className={cn("px-2", "uppercase")}>x</th>'));
bad(
  "uppercase in a template string",
  thead("<th className={`px-3 ${r ? 'a' : ''} uppercase`}>x</th>")
);
bad("class held in a variable", thead("<th className={headerCls}>x</th>"));
bad(
  "shadcn TableHeader/TableHead",
  `const a=(<TableHeader><TableRow><TableHead className="uppercase">x</TableHead></TableRow></TableHeader>);`
);
bad(
  "div-grid header with uppercase tracking",
  `const a=(<div className="grid grid-cols-3 text-xs uppercase tracking-[0.2em]">x</div>);`
);
bad(
  "div-grid header with tracking only",
  `const a=(<div className="grid grid-cols-[1fr_2fr] tracking-wider">x</div>);`
);

const bare = (name, src) =>
  test(`BARE-HEADER: ${name}`, () =>
    assert.ok(
      findViolations(src).some((v) => v.rule === "BARE-HEADER"),
      "expected BARE-HEADER"
    ));

bare("th with no contract class", thead('<th className="py-2 pr-4">x</th>'));
bare("th with no className at all", thead("<th>x</th>"));
bare(
  "multi-line th with only local padding",
  thead('<th\n  scope="col"\n  className="px-2 py-2"\n>x</th>')
);
bare("empty trailing th", thead('<th className="pb-2"></th>'));
bare(
  "th after an arrow inside a brace expression",
  thead('<th onClick={() => 1} className="py-2">x</th>')
);
ok(
  "th composed from a contract constant on a later line",
  thead('<th\n  scope="col"\n  className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}\n>x</th>')
);
ok(
  "th with a checkbox contract constant",
  thead("<th className={TABLE_HEAD_CELL_CHECKBOX_CLASS}>x</th>")
);
ok(
  "th composed via a local const that is itself a cn(TABLE_…) composition",
  `const HEAD_CELL = cn(TABLE_HEAD_CELL_CLASS, "px-3");
` + thead('<th className={cn(HEAD_CELL, "text-right")}>x</th>')
);
ok(
  "aria-hidden zero-width spacer header",
  thead('<th key={h.id} className="w-0 px-0 py-0" aria-hidden="true" />')
);
ok("contract constants", thead("<th className={TABLE_HEAD_CELL_CLASS}>x</th>"));
ok(
  "composed contract + alignment",
  thead('<th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>x</th>')
);
ok(
  "row class on tr",
  `const a=(<thead><tr className={TABLE_HEAD_ROW_CLASS}><th className={TABLE_HEAD_CELL_CLASS}>x</th></tr></thead>);`
);
ok(
  "body typography outside thead",
  `const a=(<td className="text-xs uppercase font-semibold">x</td>);`
);
ok(
  "non-table uppercase label",
  `const a=(<p className="text-[10px] uppercase tracking-wider">x</p>);`
);
ok(
  "grid-cols without header typography",
  `const a=(<div className="grid grid-cols-7 text-center text-xs">x</div>);`
);

ok(
  "local const composed from the contract",
  `const H = cn(TABLE_HEAD_CELL_CLASS, "px-3");
` + thead("<th className={H}>x</th>")
);
bad(
  "local const NOT composed from the contract",
  `const H = "uppercase";
` + thead("<th className={H}>x</th>")
);
