// Bahia Verde — handover program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// The game itself is the static site in game/: plain files, no build step, which a
// desktop browser runs fully offline. This program's only job is to hand that site
// in. It mirrors game/ and screenshots/ into the output directory and writes
// dossier.json there — the packet the bounty judge reads — using buildDossier
// from the vendored make.fun library, which must stay byte-identical to the kit's
// copy because the gate rebuilds the dossier with its own and compares the two.
//
// Run it the way the kit describes:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container the output directory is /output and MAKEFUN_OUTPUT_DIR
// is unset; everywhere else the variable names it.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Mirror the two payload folders. The screenshots folder is created first so the
// copy below has somewhere to land even if a future edit drops the folder.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps handed to buildDossier are the gate's own limits, so an entry the
// scorer would refuse (a fifth screenshot, one screenshot past 256 KiB, a game/
// tree past 993 entries or 48 MiB, a path under game/ past 1,000 UTF-8 bytes)
// fails here first, where the mistake is still cheap to fix. text_max_bytes is
// the one cap that shapes the dossier's bytes: 160 KiB of source text.
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Report what was actually handed in, counted from the output tree
// itself: if a screenshot quietly goes missing or the dossier balloons
// past a cap, this line is where it shows up first.
function countEntries(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += 1;
    if (entry.isDirectory()) n += countEntries(join(dir, entry.name));
  }
  return n;
}
const gameEntries = countEntries(join(outputDir, 'game'));
const shotCount = readdirSync(join(outputDir, 'screenshots')).length;
const dossierBytes = statSync(dossierPath).size;
console.log(
  `Bahia Verde handed in: ${gameEntries} game entries, ${shotCount} screenshots, `
  + `dossier.json ${dossierBytes} bytes — all in ${outputDir}`,
);
