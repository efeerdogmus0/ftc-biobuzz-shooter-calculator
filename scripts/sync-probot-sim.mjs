#!/usr/bin/env node
// Copies the parts of Probot Sim (github.com/probot-studio/sim, private) that the
// auto planner uses into vendor/probot-sim/. That directory is git-ignored: this
// repository is public and the Probot sources are not, so they never enter it.
//
//   node scripts/sync-probot-sim.mjs --sim <local clone of probot-studio/sim>
//
// The copy is never edited by hand. vendor/probot-sim/KAYNAK.json records the
// source commit and a sha256 per file; probot-sim.lock.json (committed) records
// only the commit the planner was last built against.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "vendor/probot-sim");
const PARTS = [
  "src/yol",
  "src/robot",
  "src/surus",
  "src/saha",
  "src/builder",
  "src/fizik",
  "vendor/builder-core",
  "vendor/katalog",
];

const arg = process.argv.indexOf("--sim");
const sim = arg > 0 ? path.resolve(process.argv[arg + 1] ?? "") : "";
if (!sim || !existsSync(path.join(sim, "src/yol/rota.ts"))) {
  console.error(
    "Usage: node scripts/sync-probot-sim.mjs --sim <probot-studio/sim clone>",
  );
  process.exit(1);
}
const git = (...a) => {
  const r = spawnSync("git", ["-C", sim, ...a], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const origin = git("remote", "get-url", "origin") ?? "";
if (!/github\.com[:/]probot-studio\/sim(\.git)?$/.test(origin)) {
  console.error(`${sim}: origin is not github.com/probot-studio/sim`);
  process.exit(1);
}
const commit = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain");

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });
const files = {};
const walk = (rel) => {
  const full = path.join(sim, rel);
  if (statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) walk(`${rel}/${name}`);
    return;
  }
  const bytes = readFileSync(full);
  files[rel] = createHash("sha256").update(bytes).digest("hex");
  mkdirSync(path.dirname(path.join(TARGET, rel)), { recursive: true });
  cpSync(full, path.join(TARGET, rel));
};
for (const part of PARTS) walk(part);

writeFileSync(
  path.join(TARGET, "KAYNAK.json"),
  JSON.stringify(
    { repo: "probot-studio/sim", commit, dirty: !!dirty, files },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  path.join(ROOT, "probot-sim.lock.json"),
  JSON.stringify({ repo: "probot-studio/sim", commit }, null, 2) + "\n",
);
console.log(
  `Copied ${Object.keys(files).length} files from probot-studio/sim@${commit?.slice(0, 7)}${dirty ? " (uncommitted changes!)" : ""}.`,
);
