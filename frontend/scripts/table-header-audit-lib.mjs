// Pure detector for the table-header contract. See docs/table-header-contract.md.
// Scans text, not a parsed tag, on purpose: a tag-level regex (`<th ...[^>]*>`) is
// truncated by the `>` inside variants like `[&>span]:uppercase`, which is an evasion.

const TOKENS = [
  /\buppercase\b/,
  /\bcapitalize\b/,
  /\btracking-\S+/,
  /\btext-(?:xs|sm|base|lg)\b/,
  /\btext-\[\d+(?:\.\d+)?(?:px|rem)\]/,
  /\bfont-(?:light|normal|medium|semibold|bold)\b/,
  /\btext-(?:foreground|muted-foreground|muted)\b/,
  /\bbg-(?:muted|card|secondary|accent|background)\b/,
];

// A header block: <thead>…</thead> or shadcn-style <TableHeader>…</TableHeader>.
const BLOCK = /<(thead|TableHeader)\b[^>]*>[\s\S]*?<\/\1>/g;
// className={identifier} — the class lives somewhere the scan cannot see.
const IDENT_CLASS = /className=\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
// A div-grid "header row" (no <thead> to scan) carrying the old uppercase/tracking style.
const GRID_LINE = /grid-cols/;
const GRID_TYPO = /\buppercase\b|\btracking-\S+/;

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

const fromContractConst = (src, name) =>
  name.startsWith("TABLE_") ||
  new RegExp(String.raw`const\s+${name}\s*=\s*(?:cn\(\s*)?TABLE_`).test(src);

// A `<th` tag's text up to its closing `>` at brace depth 0 (so `=>` and `>` inside
// `{…}` expressions do not end it early).
const thTags = (block) => {
  const tags = [];
  for (let i = block.indexOf("<th"); i !== -1; i = block.indexOf("<th", i + 1)) {
    if (!/\s|>/.test(block[i + 3] ?? "")) continue;
    let depth = 0;
    let j = i + 3;
    for (; j < block.length; j++) {
      const ch = block[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push({ start: i, text: block.slice(i, j + 1) });
  }
  return tags;
};

export function findViolations(src) {
  const out = [];
  let m;
  BLOCK.lastIndex = 0;
  while ((m = BLOCK.exec(src))) {
    const block = m[0];
    for (const p of TOKENS) {
      const g = new RegExp(p.source, "g");
      let t;
      while ((t = g.exec(block))) {
        out.push({
          line: lineOf(src, m.index + t.index),
          rule: "INLINE-HEADER",
          text: t[0],
        });
      }
    }
    IDENT_CLASS.lastIndex = 0;
    let c;
    while ((c = IDENT_CLASS.exec(block))) {
      if (!fromContractConst(src, c[1])) {
        out.push({
          line: lineOf(src, m.index + c.index),
          rule: "OPAQUE-CLASS",
          text: `className={${c[1]}}`,
        });
      }
    }
    for (const tag of thTags(block)) {
      // aria-hidden cells are zero-width spacers (e.g. the pill-collapsed Actions header): no text.
      if (/aria-hidden="true"/.test(tag.text)) continue;
      const expr = /className=\{([^]*?)\}\s*(?=\w+=|>|\/>)/.exec(tag.text)?.[1] ?? "";
      const contracted =
        tag.text.includes("TABLE_") ||
        [...expr.matchAll(/[A-Za-z_$][\w$]*/g)].some(([name]) => fromContractConst(src, name));
      if (!contracted) {
        out.push({
          line: lineOf(src, m.index + tag.start),
          rule: "BARE-HEADER",
          text: tag.text.replace(/\s+/g, " ").slice(0, 100),
        });
      }
    }
  }
  src.split("\n").forEach((l, i) => {
    if (GRID_LINE.test(l) && GRID_TYPO.test(l)) {
      out.push({ line: i + 1, rule: "GRID-HEADER", text: l.trim().slice(0, 100) });
    }
  });
  return out;
}
