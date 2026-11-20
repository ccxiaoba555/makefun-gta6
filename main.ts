// Vice Bay — the hand-in program for the make.fun gta6-01 bounty.
//
// What it does, in plain terms: it gathers the finished game (game/) and the
// screenshots (screenshots/) into the output folder the platform gives it,
// then asks the kit's dossier builder to write dossier.json from exactly
// those files. Before it writes anything, it runs its own sanity pass over
// the bundle — the page has to exist, there have to be three or four shots,
// and every shot has to fit the size cap — and it stops with an error
// instead of handing in a broken bundle.
//
// Run it locally with:  MAKEFUN_OUTPUT_DIR=out node main.ts
// The grader runs it with /output as the destination instead.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const MAX_SHOT_BYTES = 262144; // 256 KiB, the bounty cap per screenshot
const MIN_SHOTS = 3;
const MAX_SHOTS = 4;

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

function checkBundle(root) {
  const page = join(root, 'game', 'index.html');
  if (!existsSync(page) || !statSync(page).isFile()) {
    fail('game/index.html is missing — the bundle has no playable page');
  }
  const shotsDir = join(root, 'screenshots');
  if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) {
    fail('screenshots/ is missing — the bundle needs 3 or 4 screenshots');
  }
  const shots = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < MIN_SHOTS || shots.length > MAX_SHOTS) {
    fail(`screenshots/ holds ${shots.length} images, need ${MIN_SHOTS} to ${MAX_SHOTS}`);
  }
  for (const name of shots) {
    const file = join(shotsDir, name);
    const info = statSync(file);
    if (!info.isFile()) fail(`screenshots/${name} is not a regular file`);
    if (!/\.(png|jpe?g)$/i.test(name)) fail(`screenshots/${name} is not a PNG or JPEG`);
    if (info.size > MAX_SHOT_BYTES) {
      fail(`screenshots/${name} is ${info.size} bytes, over the ${MAX_SHOT_BYTES} byte cap`);
    }
  }
  return shots;
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main() {
  const shots = checkBundle(REPO_ROOT);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  copyTree(join(REPO_ROOT, 'game'), join(OUTPUT_DIR, 'game'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'));
  const dossier = buildDossier(OUTPUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  console.log(`bundle check passed: game/index.html present, ${shots.length} screenshots (${shots.join(', ')})`);
  console.log(`dossier written: ${join(OUTPUT_DIR, 'dossier.json')} (${dossier.length} bytes)`);
}

main();
