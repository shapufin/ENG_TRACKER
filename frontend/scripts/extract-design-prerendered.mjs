// Serve prerendered HTML files and run designlang on each.
// Uses the direct designlang binary path (not npx) to avoid npx overhead.
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRERENDER_DIR = path.join(REPO_ROOT, "design-audit", "prerendered");
const OUT_ROOT = path.join(REPO_ROOT, "design-audit", "app-extract-pages");
const PORT = 9111;

// Find designlang binary
const DESIGNLANG_BIN = path.join(
  process.env.LOCALAPPDATA || process.env.APPDATA,
  "npm-cache", "_npx", "2c10347c988d3245",
  "node_modules", "designlang", "bin", "design-extract.js"
);
if (!existsSync(DESIGNLANG_BIN)) {
  console.error("designlang binary not found at:", DESIGNLANG_BIN);
  console.error("Run `npx designlang --version` first to cache it.");
  process.exit(1);
}

// Collect all HTML files
const pages = [];
for (const role of ["admin", "tl", "employee"]) {
  const roleDir = path.join(PRERENDER_DIR, role);
  if (!existsSync(roleDir)) continue;
  for (const file of readdirSync(roleDir)) {
    if (file.endsWith(".html")) {
      pages.push({ role, label: file.replace(".html", ""), file: path.join(roleDir, file) });
    }
  }
}
console.log(`found ${pages.length} prerendered pages`);

// Static file server
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url || "/");
  const filePath = path.join(PRERENDER_DIR, urlPath);
  if (existsSync(filePath) && filePath.endsWith(".html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
console.log(`serving on http://127.0.0.1:${PORT}`);

function runDesignlang(url, outDir, name) {
  return new Promise((resolve) => {
    const outDirAbs = path.resolve(outDir);
    mkdirSync(outDirAbs, { recursive: true });
    const proc = spawn("node", [
      DESIGNLANG_BIN, url,
      "--out", outDirAbs,
      "--name", name,
      "--dark",
      "--no-prompts",
      "--no-history",
      "-q",
    ], { cwd: __dirname, stdio: ["pipe", "pipe", "pipe"], shell: false });

    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    proc.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

let ok = 0, fail = 0;
for (const { role, label } of pages) {
  const url = `http://127.0.0.1:${PORT}/${role}/${label}.html`;
  const outDir = path.join(OUT_ROOT, role, label);
  const result = await runDesignlang(url, outDir, label);
  // designlang often exits non-zero on a trailing step but still writes files
  const hasOutput = existsSync(path.join(outDir, `${label}-design-language.md`));
  if (hasOutput) {
    ok++;
    console.log(`  ✓ ${role}/${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${role}/${label} — ${result.stderr.slice(0, 120)}`);
  }
}

server.close();
console.log(`\nDone. ${ok}/${pages.length} pages extracted, ${fail} failed.`);
console.log(`Output: ${path.relative(REPO_ROOT, OUT_ROOT)}/<role>/<page>/`);
