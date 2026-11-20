// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (walk to a car, get in, then drive road-by-road toward the
// mission marker), so the frame is what real play looks like and the same
// seed always gives the same frame.
import { ROADS_X, ROADS_Y, SPOTS, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 8;
const PLAY_SECONDS = 24;
const END_SECONDS = 14;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function nearestRoad(value, roads) {
  return roads.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
}

/** Drive the road grid: first along the player's road to the target's road, then straight to it. */
function driveWaypoint(state) {
  const p = state.player;
  const t = state.mission.target;
  if (!t) return { x: p.x + 400, y: p.y };
  if (Math.abs(p.y - t.y) < 60 || Math.abs(p.x - t.x) < 60) return t;
  return { x: t.x, y: nearestRoad(p.y, ROADS_Y) };
}

/** One autopilot input for the current state: walk to a car, enter it, drive to the marker. */
function autopilot(state) {
  const p = state.player;
  if (!p.inCar) {
    let bestCar = null; let bestD = Infinity;
    for (const c of state.cars) {
      if (c.kind !== 'parked' && c.kind !== 'taxi') continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; bestCar = c; }
    }
    if (!bestCar) return { x: 0, y: 0, enter: false, punch: false, shoot: false };
    if (bestD < 70) return { x: 0, y: 0, enter: true, punch: false, shoot: false };
    const dx = bestCar.x - p.x; const dy = bestCar.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, enter: false, punch: false, shoot: false };
  }
  const wp = driveWaypoint(state);
  const want = Math.atan2(wp.y - p.y, wp.x - p.x);
  const diff = angleDiff(want, p.angle);
  const d = Math.hypot(wp.x - p.x, wp.y - p.y);
  const throttle = d < 90 ? 0.25 : Math.abs(diff) < 0.6 ? 1 : 0.45;
  return { x: clamp(diff * 2, -1, 1), y: throttle, enter: false, punch: false, shoot: false };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the save record to show.
 */
export function stageShot(name, world) {
  world.reset();
  const save = { bestMoney: 0, missionsDone: 0, muted: false };
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, autopilot(world.state), true);
    return { screen: SCREEN_TITLE, save };
  }
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      if (i === 10 * 60) world.raiseWanted(1); // a patrol spots the taxi job
      if (world.step(STEP, autopilot(world.state), false) & EVENT_OVER) break;
    }
    save.missionsDone = world.state.mission.index;
    return { screen: SCREEN_PLAY, save };
  }
  // end: 3-star escape — hurt, rich, cops on the tail, safehouse ahead.
  const s = world.state;
  s.player.money = 320;
  s.player.hp = 42;
  s.player.x = 600;
  s.player.y = 600;
  const taxi = s.cars.find((c) => c.kind === 'taxi') || s.cars[0];
  taxi.x = 600;
  taxi.y = 600;
  taxi.angle = 0;
  s.mission.index = 2;
  s.mission.stage = 'pickup';
  s.mission.target = { ...SPOTS.safehouse };
  s.mission.banner = '3 STARS! Lose the cops — reach the safehouse!';
  s.mission.bannerTimer = 6;
  s.player.wanted = 3;
  world.step(STEP, { x: 0, y: 0, enter: true, punch: false, shoot: false }, false);
  for (let i = 0; i < END_SECONDS / STEP; i += 1) {
    if (world.step(STEP, autopilot(world.state), false) & EVENT_OVER) break;
  }
  save.bestMoney = 320;
  save.missionsDone = 2;
  return { screen: SCREEN_PLAY, save };
}
