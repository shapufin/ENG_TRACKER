// node --test scripts/control-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "./control-audit-lib.mjs";

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

bad("Search icon beside Input", `<div><Search className="a" /><Input /></div>`, "SEARCH-ICON");
bad(
  "Search icon, multi-line tag",
  `<Search\n className="a" />\n<Input value={v} />`,
  "SEARCH-ICON"
);
ok("Search icon with no Input in the file", `<Search className="a" />`);
ok("SearchField usage is not the icon", `<SearchField aria-label="x" /><Input />`);
ok(
  "icon allowed inside SearchField.tsx",
  `<Search /><Input className="pl-9" />`,
  "src/components/ui/SearchField.tsx"
);

bad("pl-9 on Input", `<Input className="pl-9" />`, "INPUT-PAD");
bad(
  "pl-11 on raw input",
  `<input type="text" className="pl-11" />`,
  "INPUT-PAD",
  "src/components/ui/x.tsx"
);
bad("variant-prefixed pl-10", `<Input className="sm:pl-10" />`, "INPUT-PAD");
bad(
  "pl-9 inside cn() after a => handler",
  `<Input onChange={(e) => go(e)} className={cn("a", "pl-9")} />`,
  "INPUT-PAD"
);
bad("pl-9 after an [&>span] variant", `<Input className="[&>span]:x pl-9" />`, "INPUT-PAD");
ok("pl-3 is fine", `<Input className="pl-3" />`);
ok("pl-9 on a non-input element", `<div className="pl-9" />`);

bad("h-9 on Input", `<Input className="h-9" />`, "CONTROL-HEIGHT");
bad("sm:h-9 on Input", `<Input className="h-11 sm:h-9" />`, "CONTROL-HEIGHT");
bad("h-12 on Textarea", `<Textarea className="h-12" />`, "CONTROL-HEIGHT");
bad("h-10 on SelectTrigger", `<SelectTrigger className={cn("w-40", "h-10")}>`, "CONTROL-HEIGHT");
ok("min-h-24 on Textarea", `<Textarea className="min-h-24" />`);
ok("token height", `<Input className="h-[var(--control-h-sm)]" />`);
ok("h-9 on a Button", `<Button className="h-9" />`);

bad("raw input", `<input className="x" />`, "RAW-CONTROL");
bad("raw textarea", `<textarea />`, "RAW-CONTROL");
bad("raw select", `<select>\n</select>`, "RAW-CONTROL");
bad("raw type=text input", `<input type="text" />`, "RAW-CONTROL");
ok("file input", `<input type="file" />`);
ok("checkbox input", `<input type='checkbox' />`);
ok("radio input via braces", `<input type={"radio"} />`);
ok("hidden input", `<input type="hidden" />`);
ok("raw input inside components/ui", `<input />`, "src/components/ui/x.tsx");
ok("CommandPalette", `<input />`, "src/components/CommandPalette.tsx");
ok("HeaderSearch", `<input />`, "src/components/layout/HeaderSearch.tsx");
ok("a component whose name starts with Input", `<InputGroup />`);

bad(
  "max-w-sm flex-1 wrapper",
  `<div className="relative w-full max-w-sm flex-1 sm:w-auto">`,
  "TOOLBAR-WRAPPER"
);
bad("reversed order", `<div className="flex-1 max-w-sm">`, "TOOLBAR-WRAPPER");
bad(
  "with a class in between",
  `<div className="max-w-sm min-w-[12rem] flex-1">`,
  "TOOLBAR-WRAPPER"
);
ok(
  "wrapper inside FilterToolbar.tsx",
  `<div className="max-w-sm flex-1">`,
  "src/components/ui/FilterToolbar.tsx"
);
ok("max-w-sm alone", `<div className="max-w-sm">`);
