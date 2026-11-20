// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, game over.
//
// ?seed=N fixes the city layout and the traffic. ?shot=start|play|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_CRASH, EVENT_HIT, EVENT_MISSION, EVENT_OVER,
  EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_SHOOT, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE_INPUT = { x: 0, y: 0, enter: false, punch: false, shoot: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}');
    return {
      bestMoney: Number(parsed.bestMoney) || 0,
      missionsDone: Number(parsed.missionsDone) || 0,
      muted: parsed.muted === true,
    };
  } catch {
    return { bestMoney: 0, missionsDone: 0, muted: false };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the record then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = readSave();
  audio.setMuted(save.muted);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Vice Bay. Job 1: pick up the taxi fare at the yellow marker.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.player.money > save.bestMoney) save.bestMoney = world.state.player.money;
    save.missionsDone = Math.max(save.missionsDone, Math.min(3, world.state.mission.index));
    writeSave(save);
    announce(`Game over. You banked $${world.state.player.money}. Best $${save.bestMoney}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      writeSave(save);
      announce(save.muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function playSounds(events) {
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_MISSION) {
      if (world.state.mission.banner.includes('failed')) audio.fail();
      else audio.mission();
      save.missionsDone = Math.max(save.missionsDone, Math.min(3, world.state.mission.index));
      if (world.state.player.money > save.bestMoney) save.bestMoney = world.state.player.money;
      writeSave(save);
    }
  }

  function step(actions, firstStep) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE_INPUT, true);
      return;
    }
    const move = input.move();
    const inCar = world.state.player.inCar;
    const stepInput = {
      // On foot y is screen-down; driving y is throttle, so W (up) must be gas.
      x: move.x,
      y: inCar ? -move.y : move.y,
      enter: firstStep && Boolean(actions & ACTION_ENTER),
      punch: firstStep && Boolean(actions & ACTION_PUNCH),
      shoot: firstStep && Boolean(actions & ACTION_SHOOT),
    };
    const events = world.step(STEP, stepInput, false);
    playSounds(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce(`Hit! HP ${Math.ceil(world.state.player.hp)}.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions, firstStep);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    const engineLevel = screen === SCREEN_PLAY
      ? p.inCar && p.car ? Math.abs(p.car.speed) / 540 : p.moving ? 0.12 : 0
      : 0;
    audio.setEngine(engineLevel, screen === SCREEN_PLAY ? p.wanted : 0);
    renderer.draw(world.state, screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
