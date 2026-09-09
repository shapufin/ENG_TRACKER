// Post-extract sanitizer for designlang v12.21.0 output corruption.
//
// The npx-cached designlang package is patched at the source (crawler auth +
// formatter serialization), but the cache can be wiped and re-resolved to an
// unpatched copy at any time. This module is the self-healing net: it runs
// after each page extraction and repairs the known corruption classes from
// the extraction's OWN ground-truth sections (no invented values), then
// reports anything it cannot repair.
//
// Repaired classes:
//   1. FONTS/Fonts/Typography: [object Object]  → family names from the same
//      page's design-language.md Font Files table
//   2. CTA verbs: [object Object]               → button copy patterns from
//      the same design-language.md
//   3. [object Object]px breakpoints (DESIGN.md) → values from the same
//      design-language.md Breakpoints table
//   4. success/warning/error/info: [object Object]; semantic lines → derived
//      from the --success/--warning/--destructive/--info vars in the same file
//   5. Consecutive duplicate lines
//
// NOT repairable post-hoc (reported): dark-mode variable blocks equal to
// light mode — that data was never captured; re-run with the patched crawler.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const OBJECT_OBJECT = "[object Object]";

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// `| sm | 640px | min-width |` rows from the design-language.md Breakpoints table.
export function parseBreakpoints(designLanguage) {
  const out = [];
  let inTable = false;
  for (const line of designLanguage.split("\n")) {
    if (line.startsWith("## Breakpoints")) { inTable = true; continue; }
    if (inTable && line.startsWith("## ")) break;
    const m = line.match(/^\|\s*(\w+)\s*\|\s*(\d+)px\s*\|\s*(\w+)\s*\|$/);
    if (m) out.push({ label: m[1], value: m[2], type: m[3] });
  }
  return out;
}

// `| Plus Jakarta Sans Variable | self-hosted | 200 800 | normal |`
export function parseFontFamilies(designLanguage) {
  const out = [];
  let inTable = false;
  for (const line of designLanguage.split("\n")) {
    if (line.startsWith("## Font Files")) { inTable = true; continue; }
    if (inTable && line.startsWith("## ")) break;
    const m = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (m && m[1] && m[1] !== "Family" && !/^-+$/.test(m[1])) out.push(m[1]);
  }
  return out;
}

// `- "sign in" (1×)` → "sign in"
export function parseCtaCopy(designLanguage) {
  const out = [];
  let inSection = false;
  for (const line of designLanguage.split("\n")) {
    if (line.startsWith("### Button Copy Patterns")) { inSection = true; continue; }
    if (inSection && line.startsWith("## ")) break;
    const m = line.match(/^-\s+"([^"]+)"/);
    if (m) out.push(m[1]);
  }
  return out;
}

// Derive the four semantic groups from the file's own CSS variable declarations.
export function parseSemanticVars(designLanguage) {
  const groups = { success: [], warning: [], error: [], info: [] };
  for (const m of designLanguage.matchAll(/--(success|warning|destructive|info)(-foreground)?:\s*([^;\n]+);/g)) {
    const key = m[1] === "destructive" ? "error" : m[1];
    groups[key].push(`--${m[1]}${m[2] ?? ""}: ${m[3]};`);
  }
  return groups;
}

export function dedupeConsecutive(text) {
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    if (out.length > 0 && out[out.length - 1] === line && line.trim() !== "") continue;
    out.push(line);
  }
  return out.join("\n");
}

export function sanitizePageDir(pageDir) {
  const files = walk(pageDir);
  const dlFile = files.find((f) => f.endsWith("-design-language.md"));
  const dl = dlFile ? readFileSync(dlFile, "utf8") : "";
  const fonts = parseFontFamilies(dl);
  const breakpoints = parseBreakpoints(dl);
  const ctaCopy = parseCtaCopy(dl);
  const semantic = parseSemanticVars(dl);

  const stats = { fonts: 0, cta: 0, breakpoints: 0, semantic: 0, deduped: 0 };

  for (const f of files) {
    const base = path.basename(f);
    if (!/\.(md|txt|css|json|js|ts)$/.test(base)) continue;
    let c = readFileSync(f, "utf8");
    const before = c;

    if (c.includes(OBJECT_OBJECT) && fonts.length) {
      const before = c;
      c = c.replace(/FONTS: \['\[object Object\]'\]/, `FONTS: ${fonts.join(", ")}`);
      c = c.replace(/fonts: \['\[object Object\]'\]/, `fonts: [${fonts.map((x) => `'${x}'`).join(", ")}]`);
      c = c.replace(/Fonts: \[object Object\]\./, `Fonts: ${fonts.join(" · ")}.`);
      c = c.replace(/Typography: \[object Object\]\./, `Typography: ${fonts.join(" · ")}.`);
      c = c.replace(/Typography: \[object Object\]/, `Typography: ${fonts.join(" · ")}`);
      if (c !== before) stats.fonts++;
    }
    if (c.includes(OBJECT_OBJECT) && ctaCopy.length) {
      const before = c;
      c = c.replace(/CTA verbs: \[object Object\]/, `CTA verbs: ${ctaCopy.join(", ")}`);
      if (c !== before) stats.cta++;
    }
    if (base.endsWith("-DESIGN.md") && breakpoints.length && c.includes(OBJECT_OBJECT)) {
      const before = c;
      c = c.replace(
        /\*\*Breakpoints:\*\*( `\[object Object\]px`)+/g,
        `**Breakpoints:** ${breakpoints.map((b) => `\`${b.label} ${b.value}px (${b.type})\``).join(" · ")}`,
      );
      if (c !== before) stats.breakpoints++;
    }
    if (/success: \[object Object\];/.test(c) && semantic.success.length) {
      const block = [
        ...semantic.success, ...semantic.warning, ...semantic.error, ...semantic.info,
      ].join("\n");
      const before = c;
      c = c.replace(
        /success: \[object Object\];\nwarning: \[object Object\];\nerror: \[object Object\];\ninfo: \[object Object\];/,
        block,
      );
      if (c !== before) stats.semantic++;
    }
    const deduped = dedupeConsecutive(c);
    if (deduped !== c) {
      c = deduped;
      stats.deduped++;
    }

    if (c !== before) writeFileSync(f, c);
  }
  return { stats, files: files.length };
}

// Residual audit — run AFTER all page dirs are sanitized. Anything listed is
// unrepairable post-hoc (data never captured) and requires a re-run.
export function auditResidual(dirs) {
  const residual = [];
  for (const pageDir of dirs) {
    for (const f of walk(pageDir)) {
      const base = path.basename(f);
      if (!/\.(md|txt|css|json|js|ts)$/.test(base)) continue;
      const c = readFileSync(f, "utf8");
      if (c.includes(OBJECT_OBJECT)) residual.push(f);
      if (base.endsWith("-dark-mode.json")) {
        try {
          const j = JSON.parse(c);
          const v = j.variables ?? {};
          if (["colors", "shadows", "other"].some(
            (g) => v[g] && v[g].light && v[g].dark &&
              JSON.stringify(v[g].light) === JSON.stringify(v[g].dark),
          )) {
            residual.push(`${f} (dark==light)`);
          }
        } catch { residual.push(`${f} (invalid JSON)`); }
      }
    }
  }
  return residual;
}
