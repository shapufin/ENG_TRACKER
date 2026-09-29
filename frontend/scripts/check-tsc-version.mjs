// Guards the two-compiler alias layout (see docs/superpowers/UPGRADE-JOURNAL.md,
// Phase 4). Both `@typescript/native` (real TS7) and `@typescript/old` (the TS6
// package `@typescript/typescript6` depends on, which typescript-eslint reads)
// declare a `tsc` bin. npm resolves that collision first-wins by tree order,
// silently and with no warning — so a rename, a hoisting change, or a new
// dependency can make `node_modules/.bin/tsc` point at TypeScript 6 while every
// check still passes, type-checking the whole app on the wrong compiler.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MAJOR = 7;

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const modulesDir = join(frontendDir, "node_modules");
const binstub = join(modulesDir, ".bin", "tsc");

const fail = (message) => {
  console.error(`check-tsc-version: ${message}`);
  process.exit(1);
};

if (!existsSync(binstub)) {
  fail(`no tsc binstub at ${binstub} — run \`npm install\` first.`);
}

// The binstub is a generated shim whose only job is to exec one package's real
// entry point; that relative path is the authoritative record of which package
// won the bin collision.
const owner = readFileSync(binstub, "utf8").match(/\.\.\/(.+?)\/bin\/tsc\b/)?.[1];

if (!owner) {
  fail(`could not determine which package owns ${binstub}.`);
}

const { version } = JSON.parse(readFileSync(join(modulesDir, owner, "package.json"), "utf8"));

if (Number(version.split(".")[0]) !== REQUIRED_MAJOR) {
  fail(
    `node_modules/.bin/tsc resolves to "${owner}" (TypeScript ${version}), expected TypeScript ${REQUIRED_MAJOR}.x.\n` +
      "  The `tsc` bin collision resolved to the TS6 shim's compiler. Check that the\n" +
      "  `@typescript/native` alias in package.json still sorts before `@typescript/old`."
  );
}

console.log(`check-tsc-version: OK — ${owner} @ TypeScript ${version}`);
