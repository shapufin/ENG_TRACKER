// Visual fingerprint engine — structured UI snapshots for refactor verification.
//
// Captures a page's accessibility tree + computed styles + element bounds as
// a diffable JSON fingerprint, then diffs two fingerprints to detect visual
// regressions and code inconsistencies. Designed for AI-agent-driven
// refactor verification: the diff output is structured and readable, not
// pixel-based.
//
// Pure functions (diffFingerprints, detectInconsistencies, normalizeColor,
// elementsMatch, boundsEqual) are unit-tested in visual-fingerprint.test.mjs.
// The browser-dependent extractFingerprint() is exercised by the CLI runner
// (visual-verify.mjs) against a live dev server.
//
// Usage:
//   import { extractFingerprint, diffFingerprints, detectInconsistencies }
//     from "./scripts/visual-fingerprint.mjs";
//
// Conventions:
// - Reuses visual-route-manifest.mjs roles/viewports/routes.
// - Reuses visual-capture-helpers.mjs (assertRouteReady, dismissToasts).
// - Output dir: ../design-fingerprints/ (gitignored, dev-only).
// - No new npm dependencies — uses the existing playwright install.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// ---- Tolerances (match myopex's design, tuned for this repo) ----
export const TOLERANCES = {
  boundsWidth: 50, // px — width shifts < this are noise (flex reflow, scrollbar)
  boundsHeight: 30, // px — height shifts < this are noise
  boundsPosition: 100, // px — x/y shifts < this are noise (layout reflow)
};

// ---- Color normalization ----
export function normalizeColor(color) {
  if (!color) return null;
  const trimmed = String(color).trim();
  if (!trimmed) return null;
  // rgba(r,g,b,1) → rgb(r,g,b) — alpha 1 is equivalent to opaque
  const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((s) => s.trim());
    if (parts.length === 4 && parts[3] === "1") {
      return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
  }
  return trimmed;
}

// ---- Element identity ----
export function elementsMatch(a, b) {
  if (!a || !b) return false;
  // Primary: composite id (region/role["name"]) — survives DOM refactors
  if (a.id && b.id) return a.id === b.id;
  // Fallback: role + accessible name
  if (a.role && b.role && a.name != null && b.name != null) {
    return a.role === b.role && a.name === b.name;
  }
  return false;
}

// ---- Bounds comparison with tolerance ----
export function boundsEqual(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= TOLERANCES.boundsPosition &&
    Math.abs(a.y - b.y) <= TOLERANCES.boundsPosition &&
    Math.abs(a.width - b.width) <= TOLERANCES.boundsWidth &&
    Math.abs(a.height - b.height) <= TOLERANCES.boundsHeight
  );
}

// ---- Diff engine ----
// Compares two fingerprints and returns { regressions, invariants, summary }.
// Regressions = changed from baseline (needs investigation).
// Invariants = always-wrong regardless of baseline (e.g. invisible element,
// zero dimension, text overflow).
export function diffFingerprints(baseline, current) {
  const regressions = [];
  const invariants = [];

  // --- Region-level diff ---
  const baselineRegions = Object.keys(baseline.regions || {});
  const currentRegions = Object.keys(current.regions || {});

  for (const region of baselineRegions) {
    if (!currentRegions.includes(region)) {
      regressions.push({ type: "missing-region", region });
    }
  }
  for (const region of currentRegions) {
    if (!baselineRegions.includes(region)) {
      regressions.push({ type: "added-region", region });
    }
  }

  // --- Component-level diff (within shared regions) ---
  for (const region of baselineRegions) {
    if (!currentRegions.includes(region)) continue;
    const bComps = baseline.regions[region].components || [];
    const cComps = current.regions[region].components || [];

    // Match by composite id, then role+name fallback
    const matched = new Set();
    for (const bComp of bComps) {
      const cComp = cComps.find((c) => elementsMatch(bComp, c) && !matched.has(c.id || c.name));
      if (!cComp) {
        regressions.push({
          type: "missing-component",
          region,
          componentId: bComp.id,
        });
        continue;
      }
      matched.add(cComp.id || cComp.name);

      // Visibility
      if (bComp.visible !== cComp.visible) {
        regressions.push({
          type: "visibility-changed",
          region,
          componentId: bComp.id,
          from: bComp.visible,
          to: cComp.visible,
        });
      }

      // Bounds
      if (!boundsEqual(bComp.bounds, cComp.bounds)) {
        for (const prop of ["x", "y", "width", "height"]) {
          if (Math.abs(bComp.bounds[prop] - cComp.bounds[prop]) > TOLERANCES[`bounds${prop === "x" || prop === "y" ? "Position" : prop.charAt(0).toUpperCase() + prop.slice(1)}`]) {
            regressions.push({
              type: "bounds-changed",
              region,
              componentId: bComp.id,
              property: prop,
              from: bComp.bounds[prop],
              to: cComp.bounds[prop],
              delta: cComp.bounds[prop] - bComp.bounds[prop],
            });
          }
        }
      }

      // Style properties (exact compare after normalization)
      for (const prop of ["backgroundColor", "color", "fontSize", "display", "textOverflow"]) {
        const bVal = normalizeColor(bComp[prop]);
        const cVal = normalizeColor(cComp[prop]);
        if (bVal !== cVal) {
          regressions.push({
            type: "style-changed",
            region,
            componentId: bComp.id,
            property: prop,
            from: bComp[prop],
            to: cComp[prop],
          });
        }
      }
    }

    // Added components (in current, not in baseline)
    for (const cComp of cComps) {
      const bComp = bComps.find((b) => elementsMatch(b, cComp));
      if (!bComp) {
        regressions.push({
          type: "added-component",
          region,
          componentId: cComp.id,
        });
      }
    }
  }

  // --- Invariants (always-wrong, regardless of baseline) ---
  // Elements hidden via display:none are INTENTIONALLY hidden (responsive
  // duplicates: desktop table + mobile card both in the DOM) — they are not
  // defects, so visibility/zero-dimension invariants skip them.
  for (const [regionName, region] of Object.entries(current.regions || {})) {
    for (const comp of region.components || []) {
      const intentionallyHidden = comp.display === "none";
      // Not visible
      if (comp.visible === false && !intentionallyHidden) {
        invariants.push({
          type: "not-visible",
          region: regionName,
          componentId: comp.id,
        });
      }
      // Zero dimension
      if (
        comp.bounds &&
        (comp.bounds.width === 0 || comp.bounds.height === 0) &&
        !intentionallyHidden
      ) {
        invariants.push({
          type: "zero-dimension",
          region: regionName,
          componentId: comp.id,
          dimension: comp.bounds.width === 0 ? "width" : "height",
        });
      }
      // Text overflow
      if (comp.textOverflow === true && !intentionallyHidden) {
        invariants.push({
          type: "text-overflow",
          region: regionName,
          componentId: comp.id,
        });
      }
    }
  }

  const equivalent = regressions.length === 0 && invariants.length === 0;
  return {
    regressions,
    invariants,
    summary: {
      equivalent,
      regressionCount: regressions.length,
      invariantCount: invariants.length,
      baselineUrl: baseline.page?.url,
      currentUrl: current.page?.url,
    },
  };
}

// ---- Inconsistency detector ----
// Finds code/design inconsistencies WITHIN a single fingerprint (no baseline
// needed). Detects: missing accessible names, inconsistent font sizes for
// same-role elements, inconsistent backgrounds for same-role buttons,
// text overflow, zero dimensions.
export function detectInconsistencies(fingerprint) {
  const issues = [];

  // Group components by role for cross-component consistency checks
  const byRole = new Map();
  for (const [regionName, region] of Object.entries(fingerprint.regions || {})) {
    for (const comp of region.components || []) {
      if (!comp.role) continue;
      if (!byRole.has(comp.role)) byRole.set(comp.role, []);
      byRole.get(comp.role).push({ ...comp, region: regionName });
    }
  }

  // --- Per-component checks ---
  for (const [regionName, region] of Object.entries(fingerprint.regions || {})) {
    for (const comp of region.components || []) {
      // Elements hidden via display:none are responsive duplicates (desktop
      // table + mobile card both in the DOM) — not defects.
      const intentionallyHidden = comp.display === "none";
      // Missing accessible name on interactive elements
      if (
        ["button", "link", "textbox", "checkbox", "radio"].includes(comp.role) &&
        !intentionallyHidden
      ) {
        if (!comp.name || String(comp.name).trim() === "") {
          issues.push({
            type: "missing-accessible-name",
            severity: "error",
            region: regionName,
            componentId: comp.id,
            message: `${comp.role} has no accessible name`,
          });
        }
      }

      // Text overflow
      if (comp.textOverflow === true && !intentionallyHidden) {
        issues.push({
          type: "text-overflow",
          severity: "warn",
          region: regionName,
          componentId: comp.id,
          message: "Text is overflowing/truncated",
        });
      }

      // Zero dimension
      if (
        comp.bounds &&
        (comp.bounds.width === 0 || comp.bounds.height === 0) &&
        !intentionallyHidden
      ) {
        issues.push({
          type: "zero-dimension",
          severity: "error",
          region: regionName,
          componentId: comp.id,
          message: `Element has zero ${comp.bounds.width === 0 ? "width" : "height"}`,
        });
      }
    }
  }

  // --- Cross-component consistency checks ---
  for (const [role, comps] of byRole) {
    if (comps.length < 2) continue;

    // Inconsistent font sizes for same role
    const fontSizes = new Set(comps.map((c) => c.fontSize).filter(Boolean));
    if (fontSizes.size > 1) {
      issues.push({
        type: "inconsistent-font-size",
        severity: "warn",
        role,
        values: [...fontSizes],
        components: comps.map((c) => ({ id: c.id, region: c.region, fontSize: c.fontSize })),
        message: `${role} elements have ${fontSizes.size} different font sizes: ${[...fontSizes].join(", ")}`,
      });
    }

    // Inconsistent background colors for same-role interactive elements
    if (["button", "link"].includes(role)) {
      const bgColors = new Set(comps.map((c) => normalizeColor(c.backgroundColor)).filter(Boolean));
      if (bgColors.size > 1) {
        issues.push({
          type: "inconsistent-background",
          severity: "info",
          role,
          values: [...bgColors],
          components: comps.map((c) => ({
            id: c.id,
            region: c.region,
            backgroundColor: c.backgroundColor,
          })),
          message: `${role} elements have ${bgColors.size} different background colors (may be intentional: primary vs secondary)`,
        });
      }
    }
  }

  return issues;
}

// ---- Browser fingerprint extraction ----
// Runs in the browser via page.evaluate(). Captures the accessibility tree
// + computed styles + bounds for every meaningful element, grouped by
// landmark region. Returns a JSON-serializable fingerprint.
//
// This function is stringified and injected into the page, so it cannot
// reference closure variables — all config is passed as the argument.
export async function extractFingerprint(page, options = {}) {
  const { stateName = "default", viewport, theme } = options;

  const pageData = await page.evaluate(() => {
    const LANDMARK_ROLES = new Set([
      "banner",
      "main",
      "navigation",
      "contentinfo",
      "complementary",
      "search",
      "form",
      "region",
    ]);

    // Resolve an element's accessible name per ARIA spec (simplified)
    function accessibleName(el) {
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
      if (el.getAttribute("aria-labelledby")) {
        const ids = el.getAttribute("aria-labelledby").split(/\s+/);
        const labels = ids
          .map((id) => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean);
        if (labels.length) return labels.join(" ");
      }
      const title = el.getAttribute("title");
      if (title) return title.trim();
      // For buttons/links, use text content
      const text = el.textContent?.trim();
      if (text) return text.slice(0, 100);
      // For inputs, use placeholder or associated label
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        if (el.placeholder) return el.placeholder.trim();
      }
      // Radix-style widgets (checkbox/switch/combobox) render as BUTTONs with
      // role attributes — the <label for=id> association applies to ANY
      // element with an id, not just native form controls.
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        if (el.placeholder) return el.placeholder.trim();
      }
      return "";
    }

    // Resolve ARIA role (explicit > implicit)
    function resolveRole(el) {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      const IMPLICIT = {
        header: "banner",
        nav: "navigation",
        main: "main",
        footer: "contentinfo",
        aside: "complementary",
        form: "form",
        section: "region",
        search: "search",
        button: "button",
        a: "link",
        input: "textbox",
        textarea: "textbox",
        select: "listbox",
        h1: "heading",
        h2: "heading",
        h3: "heading",
        h4: "heading",
        h5: "heading",
        h6: "heading",
        img: "img",
        table: "table",
        ul: "list",
        ol: "list",
        li: "listitem",
      };
      return IMPLICIT[tag] || null;
    }

    // Check if an element is a landmark region
    function isLandmark(el) {
      const role = resolveRole(el);
      return LANDMARK_ROLES.has(role);
    }

    // Extract computed style for the properties we care about.
    // textOverflow is only TRUE for REAL truncation: overflowing content
    // (scrollWidth > clientWidth) under a hidden/clip overflow. The default
    // `clip` + `overflow: hidden` state (icon boxes etc.) is not truncation.
    function extractStyle(el) {
      const cs = getComputedStyle(el);
      const overflowHidden = cs.overflow === "hidden" || cs.overflow === "clip" || cs.overflowX === "hidden" || cs.overflowX === "clip";
      const reallyOverflows = overflowHidden && el.scrollWidth > el.clientWidth + 1;
      return {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontSize: cs.fontSize,
        display: cs.display,
        textOverflow: reallyOverflows,
      };
    }

    // Build a composite id: region/role["name"] — headings include their
    // level (h1/h2/...) so a page title and a same-named table header
    // don't collide into one identity.
    function compositeId(regionKey, role, name, el) {
      const safeName = String(name || "").replace(/"/g, '\\"').slice(0, 60);
      const rolePart = role === "heading" && el ? `heading:${el.tagName.toLowerCase()}` : role;
      return `${regionKey}/${rolePart}["${safeName}"]`;
    }

    // Walk the DOM, grouping elements by their nearest landmark ancestor
    const regions = {};
    const ungrouped = [];

    function walk(el, currentRegion) {
 {
        const role = resolveRole(el);
        // If this element IS a landmark, it becomes the region container
        if (isLandmark(el) && role !== "region") {
          const regionKey = role;
          if (!regions[regionKey]) {
            const rect = el.getBoundingClientRect();
            regions[regionKey] = {
              role,
              bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
              background: getComputedStyle(el).backgroundColor,
              components: [],
            };
          }
          currentRegion = regionKey;
        }

        // Capture meaningful elements (interactive + headings + text blocks)
        const isInteractive = ["button", "link", "textbox", "checkbox", "radio", "menuitem", "tab", "switch", "combobox", "slider"].includes(role);
        const isHeading = role === "heading";
        const isImg = role === "img";
        const hasTestId = el.hasAttribute("data-testid");
        const shouldCapture = isInteractive || isHeading || isImg || hasTestId;

        if (shouldCapture && currentRegion && regions[currentRegion]) {
          const name = accessibleName(el);
          const rect = el.getBoundingClientRect();
          const cs = extractStyle(el);
          const comp = {
            id: compositeId(currentRegion, role, name, el),
            role,
            name,
            bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            visible: rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none",
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            fontSize: cs.fontSize,
            display: cs.display,
            textOverflow: cs.textOverflow,
            resolveStatus: "ok",
          };
          regions[currentRegion].components.push(comp);
        } else if (shouldCapture && !currentRegion) {
          const name = accessibleName(el);
          const rect = el.getBoundingClientRect();
          const elRole = resolveRole(el);
          ungrouped.push({
            id: compositeId("ungrouped", elRole, name, el),
            role: elRole,
            name,
            bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            visible: rect.width > 0 && rect.height > 0,
            backgroundColor: getComputedStyle(el).backgroundColor,
            color: getComputedStyle(el).color,
            fontSize: getComputedStyle(el).fontSize,
            display: getComputedStyle(el).display,
            textOverflow: false,
            resolveStatus: "fallback",
          });
        }

        // Recurse into children
        for (const child of el.children) {
          walk(child, currentRegion);
        }
      }
    }

    // Start from body
    const body = document.body;
    if (body) {
      for (const child of body.children) {
        walk(child, null);
      }
    }

    return {
      page: {
        url: window.location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        background: getComputedStyle(document.body).backgroundColor,
      },
      regions,
      ungrouped,
    };
  });

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    state: stateName,
    ...pageData,
  };
}

// ---- Fingerprint I/O ----
export function saveFingerprint(fingerprint, outDir, filename) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const filepath = path.join(outDir, filename);
  writeFileSync(filepath, JSON.stringify(fingerprint, null, 2), "utf-8");
  return filepath;
}

export function loadFingerprint(filepath) {
  if (!existsSync(filepath)) return null;
  return JSON.parse(readFileSync(filepath, "utf-8"));
}

// ---- Diff report formatter (human-readable for AI agents) ----
export function formatDiffReport(diff) {
  const lines = [];
  const s = diff.summary;
  lines.push(`# Visual Diff Report`);
  lines.push(`Baseline: ${s.baselineUrl || "unknown"}`);
  lines.push(`Current:  ${s.currentUrl || "unknown"}`);
  lines.push(`Equivalent: ${s.equivalent ? "YES" : "NO"}`);
  lines.push(`Regressions: ${s.regressionCount} | Invariants: ${s.invariantCount}`);
  lines.push("");

  if (diff.invariants.length > 0) {
    lines.push("## Invariants (always-wrong, fix regardless of baseline)");
    for (const inv of diff.invariants) {
      lines.push(`- [${inv.type}] ${inv.region}/${inv.componentId}`);
    }
    lines.push("");
  }

  if (diff.regressions.length > 0) {
    lines.push("## Regressions (changed from baseline)");
    for (const reg of diff.regressions) {
      const loc = reg.region ? `${reg.region}/${reg.componentId || ""}` : reg.region || "";
      switch (reg.type) {
        case "missing-region":
          lines.push(`- MISSING REGION: ${reg.region}`);
          break;
        case "added-region":
          lines.push(`- ADDED REGION: ${reg.region}`);
          break;
        case "missing-component":
          lines.push(`- MISSING COMPONENT: ${loc}`);
          break;
        case "added-component":
          lines.push(`- ADDED COMPONENT: ${loc}`);
          break;
        case "visibility-changed":
          lines.push(`- VISIBILITY CHANGED: ${loc} (${reg.from} → ${reg.to})`);
          break;
        case "bounds-changed":
          lines.push(`- BOUNDS CHANGED: ${loc} .${reg.property} (${reg.from} → ${reg.to}, Δ${reg.delta}px)`);
          break;
        case "style-changed":
          lines.push(`- STYLE CHANGED: ${loc} .${reg.property} (${reg.from} → ${reg.to})`);
          break;
        default:
          lines.push(`- ${reg.type}: ${loc}`);
      }
    }
  }

  return lines.join("\n");
}

// ---- Inconsistency report formatter ----
export function formatInconsistencyReport(issues) {
  const lines = [];
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const infos = issues.filter((i) => i.severity === "info");

  lines.push(`# Inconsistency Report`);
  lines.push(`Errors: ${errors.length} | Warnings: ${warns.length} | Info: ${infos.length}`);
  lines.push("");

  for (const [label, group] of [["ERRORS", errors], ["WARNINGS", warns], ["INFO", infos]]) {
    if (group.length === 0) continue;
    lines.push(`## ${label}`);
    for (const issue of group) {
      const loc = issue.componentId
        ? `${issue.region}/${issue.componentId}`
        : issue.role
          ? `${issue.role} (cross-component)`
          : issue.region || "";
      lines.push(`- [${issue.type}] ${loc}: ${issue.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
