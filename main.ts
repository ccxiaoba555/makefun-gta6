// Vice Bay — entry point for the gta6-01 submission (Node 22, standard library only).
//
// The game itself is the plain static site in game/: game/index.html plus the ES modules
// under game/src/, no libraries and no network requests, so a desktop browser can load it
// straight from disk. It is a top-down 2D open-world crime game on a 3200x2400 map with a
// road grid, traffic, pedestrians and police: walk around on foot, steal a car, take on
// three jobs (a taxi fare, a timed parcel delivery, and a 3-star escape to the safehouse),
// earn cash, and watch the wanted stars climb when the police spot you. Getting busted or
// losing all health ends the run; best money and missions completed are kept in
// localStorage, and the title screen, HUD, pause and game-over screens are all in-game.
//
// Controls: WASD / arrow keys to move (throttle and steering while driving), E to enter
// or exit a car, J to punch, K to shoot, Space / Enter to confirm, P or Esc to pause,
// M to mute. Clicking also confirms. Touch is not a separate path: the canvas takes
// pointer input as a confirm tap.
//
// File layout: main.ts (this file, the packager), serve.ts (local preview server),
// game/index.html + game/src/*.js (the game), screenshots/ (1-start.jpg … 4-end.jpg,
// the first by name is the cover), vendor/makefun-game.ts (the vendored make.fun
// dossier builder, untouched), shots.json (the screenshot manifest).
//
// Run it with `node serve.ts` for a local preview at http://localhost:8080, or package
// it with `MAKEFUN_OUTPUT_DIR=out node main.ts`: it copies game/ and screenshots/ into
// the output directory, checks the copied bundle is actually submittable (see
// checkBundle below), and writes dossier.json, the summary the judge reads.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Screenshot limits the bundle must satisfy before a dossier is written: at most
// 4 shots, each no bigger than 256 KiB. Kept here next to the check so the two
// cannot drift apart from the dossier caps passed to buildDossier below.
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 262144;

// Fail loudly instead of handing the judge a broken bundle: complain about the
// first problem found and stop with a non-zero exit, before dossier.json exists.
function fail(message: string): never {
  console.error(`Vice Bay packaging failed: ${message}`);
  process.exit(1);
}

// Check the copied bundle in the output directory, not the sources, so a copy
// that silently dropped a file cannot slip through.
function checkBundle(outDir: string): void {
  const entry = join(outDir, 'game', 'index.html');
  if (!existsSync(entry)) fail(`game/index.html is missing from the output bundle (${entry})`);

  const shotsDir = join(outDir, 'screenshots');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing from the output bundle');
  const shots = readdirSync(shotsDir)
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .sort();
  if (shots.length < 1) fail('screenshots/ has no PNG or JPEG image (need 1-4)');
  if (shots.length > MAX_SCREENSHOTS) {
    fail(`screenshots/ has ${shots.length} images, over the limit of ${MAX_SCREENSHOTS}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      fail(`screenshots/${name} is ${size} bytes, over the 256 KiB limit (${MAX_SCREENSHOT_BYTES})`);
    }
  }
  console.log(`Vice Bay bundle OK: game/index.html present, ${shots.length} screenshot(s) within limits`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

checkBundle(out);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
