// Generates roster-template.xlsx (repo root) from data/seed.json, using
// the app's OWN template builder (lib/roster-template.ts) so the shipped
// file can never drift from the in-app download. The builder is compiled
// on the fly into node_modules/.roster-template-build (so its exceljs
// require resolves) and cleaned up afterwards.
//
// The in-app download stays authoritative (it bakes the LIVE snapshot);
// this static copy is a convenience hand-off for encoders. The .xlsx is
// gitignored and is NOT part of the pushed app bundle.
//
// Run: node scripts/gen-roster-template.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "node_modules", ".roster-template-build");
const require = createRequire(join(root, "package.json"));

execFileSync(join(root, "node_modules", ".bin", "tsc"), [
  join(root, "lib", "roster-template.ts"),
  join(root, "lib", "roster-import.ts"),
  "--outDir", buildDir,
  "--module", "commonjs",
  "--target", "es2022",
  "--moduleResolution", "node",
  "--esModuleInterop",
  "--skipLibCheck",
], { stdio: "inherit", cwd: root });

try {
  const seed = JSON.parse(readFileSync(join(root, "data", "seed.json"), "utf8"));
  const lists = {
    sports: seed.sports.map((s) => ({ name: s.name, divisions: s.divisions.map((d) => d.name) })),
    teams: seed.teams,
  };
  const { buildRosterTemplateBuffer } = require(join(buildDir, "roster-template.js"));
  const buf = await buildRosterTemplateBuffer(lists);
  const outPath = join(root, "roster-template.xlsx");
  writeFileSync(outPath, Buffer.from(buf));
  const divCount = lists.sports.reduce((n, s) => n + s.divisions.length, 0);
  console.log(`wrote ${outPath} (${buf.byteLength} bytes) — ${lists.sports.length} sports, ${lists.teams.length} teams, ${divCount} divisions baked in`);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
