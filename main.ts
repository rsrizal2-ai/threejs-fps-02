// Emberline — threejs-fps-02 entry driver. Node 22+, standard library only.
// It packs the playable game for the grader: the game/ and screenshots/ folders
// sitting beside this file are copied into the output directory, and then the
// vendored make.fun library writes /output/dossier.json, the summary the judge
// reads. The dossier must equal what buildDossier writes from the same game/
// and screenshots/, so this file does nothing clever — it just stages the files
// and calls the library with the scorer's caps.
//
// Try it locally with an output folder of your own:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// To play the game instead, run `node serve.ts` and open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (kit reference/gate.json). Only text_max_bytes shapes the
// dossier's bytes; the other caps refuse an entry the scorer would refuse — at
// most 4 screenshots of 256 KiB each, at most 993 files / 48 MiB under game/
// (game/ counts beside the output's own 1000-entry cap, next to screenshots/
// and dossier.json itself).
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// Copy a top-level folder into the output when it exists beside this file.
function stageFolder(name: string): void {
  const source = join(rootDir, name);
  if (existsSync(source)) cpSync(source, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
stageFolder('game');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
stageFolder('screenshots');

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, dossierCaps));
