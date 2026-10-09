// node --test scripts/control-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations, isExcluded } from "./control-audit-lib.mjs";

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
bad("h-9 on a Button", `<Button className="h-9" />`, "CONTROL-HEIGHT");
bad("sm:h-10 on a Button", `<Button className="px-2 sm:h-10" />`, "CONTROL-HEIGHT");
bad(
  "h-12 inside cn() on a Button",
  `<Button className={cn("a", flag && "h-12")}>`,
  "CONTROL-HEIGHT"
);
bad(
  "h-8 on a multi-line Button after a => handler",
  `<Button
 onClick={() => go()}
 className="h-8 gap-2"
>`,
  "CONTROL-HEIGHT"
);
bad("h-8 on DateRangePicker", `<DateRangePicker className="h-8 w-auto" />`, "CONTROL-HEIGHT");
bad("h-12 on DatePicker", `<DatePicker className={cn("h-12")} />`, "CONTROL-HEIGHT");
bad(
  "h-9 w-full is not a square icon button",
  `<Button className="h-9 w-full" />`,
  "CONTROL-HEIGHT"
);
ok("icon-only square h-8 w-8 Button", `<Button className="h-8 w-8 p-0" />`);
ok("icon-only size-9 Button", `<Button className="size-9 h-9" />`);
ok("size=icon Button with an explicit h-8", `<Button size="icon" className="h-8" />`);
ok("Button on a control size", `<Button size="control-sm" className="gap-2" />`);
ok("DateRangePicker on controlSize", `<DateRangePicker controlSize="sm" className="w-auto" />`);

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
ok(
  "bespoke raw input may carry its own height and padding",
  `<input className="h-9 pl-9" />`,
  "src/components/layout/HeaderSearch.tsx"
);
bad(
  "bespoke exemption does not cover the shared Input",
  `<Input className="h-9" />`,
  "CONTROL-HEIGHT",
  "src/components/layout/HeaderSearch.tsx"
);
test("isExcluded matches a directory prefix only", () => {
  assert.equal(isExcluded("src/plugins/engagement/a.tsx", ["src/plugins/engagement"]), true);
  assert.equal(isExcluded("src/plugins/engagement2/a.tsx", ["src/plugins/engagement"]), false);
  assert.equal(isExcluded("src/plugins/x/a.tsx", []), false);
});
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

bad("Input type=search", `<Input type="search" value={v} />`, "SEARCH-TYPE");
bad("Input type={'search'}", `<Input type={'search'} />`, "SEARCH-TYPE");
bad(
  "multi-line Input type=search after a => handler",
  `<Input
 onChange={(e) => go(e)}
 type="search"
/>`,
  "SEARCH-TYPE"
);
ok(
  "SearchField.tsx may render type=search",
  `<Input type="search" />`,
  "src/components/ui/SearchField.tsx"
);
ok("Input type=text", `<Input type="text" />`);
