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
      const fromContract = new RegExp(String.raw`const\s+${c[1]}\s*=\s*(?:cn\(\s*)?TABLE_`).test(
        src
      );
      if (!c[1].startsWith("TABLE_") && !fromContract) {
        out.push({
          line: lineOf(src, m.index + c.index),
          rule: "OPAQUE-CLASS",
          text: `className={${c[1]}}`,
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
