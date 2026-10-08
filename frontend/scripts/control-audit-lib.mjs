// Pure detector for the control-kit contract (docs/superpowers/plans/2026-10-08-admin-ui-polish-and-grid.md 4.4).
// Text-based on purpose: a tag-level regex is truncated by the `>` in `=>` / `[&>span]:` inside a className,
// so tags are scanned with a small brace-aware walker instead.

const OPEN_TAG = /<(Input|input|Textarea|SelectTrigger)(?=[\s/>])/g;
const RAW_FIELD = /<(input|textarea|select)(?=[\s/>])/g;
const ICON = /<Search(?![A-Za-z0-9_])/g;
const HAS_INPUT = /<Input(?=[\s/>])/;
const PL = /(?<![\w-])pl-(?:8|9|10|11)(?![\w.-])/;
const H = /(?<![\w-])h-(?:8|9|10|11|12)(?![\w.-])/;
const WRAPPER = /max-w-sm[^"'`\n]*\bflex-1\b|\bflex-1\b[^"'`\n]*max-w-sm/;
const NON_TEXT_TYPE = /type\s*=\s*(?:"|'|\{\s*["'`])(?:file|checkbox|radio|hidden)\b/;

const norm = (p) => p.replace(/\\/g, "/");
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

/** Source text of the opening tag that starts at `start` (brace- and quote-aware). */
function tagText(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (depth === 0 && (c === '"' || c === "'")) {
      const end = src.indexOf(c, i + 1);
      if (end === -1) break;
      i = end;
    } else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

export function findViolations(src, path = "src/x.tsx") {
  const p = norm(path);
  const out = [];
  const inUi = p.includes("components/ui/");
  const isSearchField = p.endsWith("components/ui/SearchField.tsx");
  const isToolbar = p.endsWith("components/ui/FilterToolbar.tsx");
  const isRawAllowed =
    inUi || /(?:^|\/)(CommandPalette|HeaderSearch)\.tsx$/.test(p) || /Dropzone/i.test(p);
  const push = (idx, rule, text) =>
    out.push({ line: lineOf(src, idx), rule, text: text.replace(/\s+/g, " ").slice(0, 100) });

  if (!isSearchField && HAS_INPUT.test(src)) {
    for (const m of src.matchAll(ICON)) push(m.index, "SEARCH-ICON", m[0]);
  }

  for (const m of src.matchAll(OPEN_TAG)) {
    const tag = tagText(src, m.index);
    const name = m[1];
    if (!isSearchField && (name === "Input" || name === "input")) {
      const t = tag.match(PL);
      if (t) push(m.index, "INPUT-PAD", t[0]);
    }
    const h = tag.match(H);
    if (h) push(m.index, "CONTROL-HEIGHT", `${name} ${h[0]}`);
  }

  if (!isRawAllowed) {
    for (const m of src.matchAll(RAW_FIELD)) {
      if (m[1] === "input" && NON_TEXT_TYPE.test(tagText(src, m.index))) continue;
      push(m.index, "RAW-CONTROL", m[0]);
    }
  }

  if (!isToolbar) {
    src.split("\n").forEach((l, i) => {
      if (WRAPPER.test(l))
        out.push({ line: i + 1, rule: "TOOLBAR-WRAPPER", text: l.trim().slice(0, 100) });
    });
  }
  return out;
}
