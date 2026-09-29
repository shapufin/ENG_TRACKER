// Guards the two-compiler alias layout (see docs/superpowers/UPGRADE-JOURNAL.md,
// Phase 4). Both `@typescript/native` (real TS7) and `@typescript/old` (the TS6
// package `@typescript/typescript6` depends on, which typescript-eslint reads)
// declare a `tsc` bin. npm resolves that collision first-wins by tree order,
// silently and with no warning — so a rename, a hoisting change, or a new
// dependency can make `node_modules/.bin/tsc` point at TypeScript 6 while every
// check still passes, type-checking the whole app on the wrong compiler.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MAJOR = 7;

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const modulesDir = join(frontendDir, "node_modules");
const binstub = join(modulesDir, ".bin", "tsc");

const fail = (message) => {
  console.error(`check-tsc-version: ${message}`);
  process.exit(1);
};

const isInside = (parent, child) => {
  const rel = relative(parent, child);
  // On Windows `relative()` returns an absolute path when the two paths are on
  // different drives or UNC shares, where walking up would never reach `parent`.
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

// Walks up from a file to the root of the installed package containing it,
// stopping at node_modules so we never escape into the app's own package.json.
const packageRootOf = (file) => {
  let dir = dirname(file);
  while (isInside(modulesDir, dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return null;
};

// npm exposes a package's bin two different ways, and which one appears is
// platform-dependent: a symlink straight into the owning package (POSIX), or a
// generated shim script that execs it by relative path (Windows). Handle both,
// since this script runs in CI and in the Docker build as well as locally.
const resolveOwnerDir = () => {
  if (!existsSync(binstub)) {
    fail(`no tsc binstub at ${binstub} — run \`npm install\` first.`);
  }

  const fromSymlink = packageRootOf(realpathSync(binstub));
  if (fromSymlink) return fromSymlink;

  const shimTarget = readFileSync(binstub, "utf8").match(/\.\.[\\/](.+?)[\\/]bin[\\/]tsc\b/)?.[1];
  if (shimTarget) {
    const dir = join(modulesDir, shimTarget);
    if (existsSync(join(dir, "package.json"))) return dir;
  }

  return fail(`could not determine which package owns ${binstub}.`);
};

const ownerDir = resolveOwnerDir();
const { version } = JSON.parse(readFileSync(join(ownerDir, "package.json"), "utf8"));
const owner = relative(modulesDir, ownerDir).replace(/\\/g, "/");

if (!version) {
  fail(`the package owning ${binstub} ("${owner}") declares no version.`);
}

if (Number(version.split(".")[0]) !== REQUIRED_MAJOR) {
  fail(
    `node_modules/.bin/tsc resolves to "${owner}" (TypeScript ${version}), expected TypeScript ${REQUIRED_MAJOR}.x.\n` +
      "  The `tsc` bin collision resolved to the TS6 shim's compiler. Check that the\n" +
      "  `@typescript/native` alias in package.json still sorts before `@typescript/old`."
  );
}

console.log(`check-tsc-version: OK — ${owner} @ TypeScript ${version}`);
