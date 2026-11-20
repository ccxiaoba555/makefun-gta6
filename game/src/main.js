// Vice Bay — the game loop and all the rules.
// Owns the player, traffic, pedestrians, police, bullets and the eight jobs,
// and hands each frame to render.js to draw. The city itself lives in
// world.js; the look lives in render.js; this file is only the rules.

import {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, PLAYER_WALK_SPEED, PLAYER_HP, PLAYER_RADIUS,
  CAR_ACCEL, CAR_MAX_SPEED, CAR_REVERSE_SPEED, CAR_TURN, CAR_BRAKE, CAR_DRAG,
  MAX_WANTED, WANTED_DECAY_SECONDS, BULLET_SPEED, BULLET_RANGE,
  SHOOT_COOLDOWN, PUNCH_COOLDOWN, PUNCH_REACH, PARCEL_TIME_LIMIT,
  MISSIONS, DISTRICTS, RADIO_STATIONS, WEAPONS, GARAGE_UPGRADES,
  RESPECT_RANKS, CAR_COLORS, SAVE_KEY,
} from './config.js';
import { hashSeed, makeRng, rngInt, rngRange, rngPick, rngChance } from './random.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import {
  buildCity, isWater, resolveBuildingCollision, clampToWorld,
  randomRoadPoint, randomPavementPoint,
} from './world.js';
import { drawGame } from './render.js';
import { readShotParams, applyShot } from './shots.js';

const CITY_SEED = hashSeed('vice-bay-city');
const LANDMARKS = ['taxiStand', 'depot', 'marina', 'safehouse'];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function turnToward(angle, target, maxStep) {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + Math.max(-maxStep, Math.min(maxStep, d));
}

// Snap a point to the nearest road centreline, for roadblocks and spikes.
// The result is clamped inside the world so a block can never land off-map.
function snapToRoad(x, y, city) {
  x = Math.max(160, Math.min(WORLD_W - 160, x));
  y = Math.max(160, Math.min(WORLD_H - 160, y));
  let best = null;
  let bestD = Infinity;
  for (const rx of city.vertical) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, vertical: true }; }
  }
  for (const ry of city.horizontal) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, vertical: false }; }
  }
  return best;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.input.attachCanvas(canvas);
    this.sound = new SoundBank();
    this.input.onTap = () => this.sound.unlock();
    this.input.onClick = () => this.handleClick();
    this.shot = readShotParams();
    this.city = buildCity(makeRng(CITY_SEED));
    this.best = this.loadBest();
    this.reset(this.shot.seed);
    this.last = performance.now();
    this.fareTimer = 0;
    window.__vicebay = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  loadBest() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { money: parsed.money || 0, missions: parsed.missions || 0 };
      }
    } catch (err) { /* fresh start when storage is unavailable */ }
    return { money: 0, missions: 0 };
  }

  saveBest() {
    this.best.money = Math.max(this.best.money, Math.floor(this.player.money));
    this.best.missions = Math.max(this.best.missions, this.stats.missionsDone);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.best));
    } catch (err) { /* storage unavailable; the session still plays */ }
  }

  reset(seed) {
    const rng = makeRng(CITY_SEED + (seed || 1) * 7919);
    this.rng = rng;
    this.time = 0;
    this.mode = 'menu';
    this.overReason = null;
    this.player = {
      x: 600, y: 320, angle: -Math.PI / 2, hp: PLAYER_HP,
      money: 0, onFoot: true, car: null, speed: 0,
    };
    this.traffic = [];
    this.peds = [];
    this.cops = [];
    this.bullets = [];
    this.particles = [];
    this.wanted = 0;
    this.crimeTimer = 0;
    this.bustMeter = 0;
    this.hitCooldown = 0;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.roadblockHitCooldown = 0;
    this.message = '';
    this.messageTimer = 0;
    this.muted = false;
    this.stats = { missionsDone: 0, earned: 0 };
    this.missionIndex = 0;
    // Crew and reputation: respect grows with jobs and turf work, and the
    // rank it buys slows the police response and opens garage tiers.
    this.respect = 0;
    this.standing = {};
    for (const d of DISTRICTS) this.standing[d.name] = 0;
    this.standing.Midtown = 0;
    // Garage mods: engine / armor / paint, 0–3 tiers each.
    this.mods = { engine: 0, armor: 0, paint: 0 };
    // Weapon slots: 0 pistol, 1 shotgun. Radio: station index.
    this.weapon = 0;
    this.radio = 0;
    this.radioOn = false;
    // Police escalation: roadblocks, Air One helicopter, spike strips.
    this.roadblocks = [];
    this.spikes = [];
    this.heli = null;
    this.tireTimer = 0;
    this.camera = { x: 900, y: 500 };
    for (const car of this.city.parkedCars) car.taken = false;
    for (let i = 0; i < 14; i++) this.traffic.push(this.makeTrafficCar());
    for (let i = 0; i < 18; i++) this.peds.push(this.makePed());
    this.setupMission(0);
  }

  respectRank() {
    let rank = RESPECT_RANKS[0];
    for (const r of RESPECT_RANKS) if (this.respect >= r.min) rank = r;
    return rank.name;
  }

  effMaxSpeed() {
    let top = CAR_MAX_SPEED * (1 + 0.12 * this.mods.engine);
    if (this.tireTimer > 0) top *= 0.55;
    return top;
  }

  makeTrafficCar() {
    const spot = randomRoadPoint(this.rng, this.city);
    const dir = rngChance(this.rng, 0.5) ? 1 : -1;
    return {
      x: spot.x, y: spot.y,
      angle: spot.vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: rngRange(this.rng, 90, 170),
      color: rngPick(this.rng, CAR_COLORS),
      vertical: spot.vertical, dir,
      taxi: rngChance(this.rng, 0.12),
    };
  }

  makePed() {
    const spot = randomPavementPoint(this.rng, this.city);
    return {
      x: spot.x, y: spot.y,
      angle: rngRange(this.rng, 0, Math.PI * 2),
      color: rngPick(this.rng, ['#e84a6e', '#4a9de8', '#e8a33a', '#7ae84a', '#c9a2e8', '#e8e8e8']),
      alive: true, flee: false, speed: rngRange(this.rng, 28, 52),
      tx: spot.x, ty: spot.y, wait: 0,
    };
  }

  makeCop(x, y) {
    return {
      x, y, angle: 0, speed: 0, color: '#e8e8e8', police: true,
      hp: 100, shootTimer: rngRange(this.rng, 0.8, 1.6),
    };
  }

  showMessage(text, seconds = 3) {
    this.message = text;
    this.messageTimer = seconds;
  }

  addWanted(n) {
    this.wanted = Math.min(MAX_WANTED, this.wanted + n);
    this.crimeTimer = 0;
  }

  // Resolve a stage's target point: a city landmark, a district, or a
  // fixed coordinate.
  stageTarget(stage) {
    if (stage.at) {
      const spot = this.city[stage.at];
      return { x: spot.x, y: spot.y, label: stage.label };
    }
    if (stage.district) {
      const d = DISTRICTS.find((x) => x.name === stage.district);
      if (d) return { x: d.x, y: d.y, label: stage.label };
    }
    return { x: stage.x, y: stage.y, label: stage.label };
  }

  setupMission(index, stage) {
    this.missionIndex = index;
    const def = MISSIONS[index];
    if (!def) { this.mission = null; return; }
    const startStage = stage === 'dropoff' ? 1 : 0;
    const stages = def.stages.map((s) => ({
      ...s,
      target: this.stageTarget(s),
      timer: s.timer != null ? s.timer : null,
    }));
    this.mission = {
      id: def.id, name: def.name, briefing: def.briefing,
      reward: def.reward, respect: def.respect || 10,
      stages, stageIdx: startStage,
      timer: def.timeLimit != null ? def.timeLimit : null,
      timeLimit: def.timeLimit != null ? def.timeLimit : null,
    };
    this.enterStage();
  }

  // Effects that fire when a stage starts (heat, crew chatter).
  enterStage() {
    const m = this.mission;
    if (!m) return;
    const stage = m.stages[m.stageIdx];
    if (!stage) return;
    if (stage.wantedOnEnter) {
      this.addWanted(stage.wantedOnEnter);
      this.showMessage('Heat rising — ' + this.wanted + ' stars on you now.', 2.5);
    }
  }

  currentTarget() {
    const m = this.mission;
    if (!m) return null;
    const stage = m.stages[m.stageIdx];
    return stage ? stage.target : null;
  }

  advanceStage() {
    const m = this.mission;
    const stage = m.stages[m.stageIdx];
    // Turf work pays respect per corner, straight away.
    if (m.id === 'turf') {
      this.respect += 5;
      const key = stage.district || (m.stageIdx === 1 ? 'Midtown' : m.stageIdx === 2 ? 'Gull Lane' : 'Coral Row');
      this.standing[key] = (this.standing[key] || 0) + 1;
      this.showMessage('Corner claimed — ' + key + ' standing up. Respect +' + 5, 2.5);
    } else if (m.stageIdx === 0 && m.stages.length > 1) {
      this.sound.pickup();
    }
    m.stageIdx += 1;
    if (m.stageIdx >= m.stages.length) {
      this.completeMission();
      return;
    }
    this.enterStage();
  }

  setupRepeatFare() {
    const spot = this.city[rngPick(this.rng, LANDMARKS)];
    this.mission = {
      id: 'fare', name: 'Taxi Fare', briefing: 'A fare is waiting — get them across town.',
      reward: rngInt(this.rng, 90, 150), respect: 5, stages: [],
      stageIdx: 0, timer: null, timeLimit: null,
      target: { x: spot.x, y: spot.y, label: 'FARE HERE' },
    };
  }

  completeMission() {
    const m = this.mission;
    // The crew pays a 10% bonus once you hold Hustler rank or better.
    const bonus = this.respect >= 30 ? Math.round(m.reward * 0.1) : 0;
    const paid = m.reward + bonus;
    this.player.money += paid;
    this.stats.earned += paid;
    this.stats.missionsDone += 1;
    this.respect += m.respect || 10;
    this.sound.cash();
    this.showMessage('Job done! +$' + paid + (bonus ? ' (crew bonus +$' + bonus + ')' : '') + '  Respect +' + (m.respect || 10), 3.5);
    this.saveBest();
    if (m.id === 'fare') {
      this.mission = null;
      this.fareTimer = 5;
      return;
    }
    const next = this.missionIndex + 1;
    if (next < MISSIONS.length) {
      this.setupMission(next);
    } else {
      this.wanted = 0;
      this.cops = [];
      this.roadblocks = [];
      this.spikes = [];
      this.heli = null;
      this.mission = null;
      this.fareTimer = 6;
      this.showMessage('All 8 jobs done — Vice Bay is yours. More fares coming.', 4);
    }
  }

  failMission(reason) {
    this.showMessage(reason + ' — the job goes back on the board. Try again.', 3.5);
    this.setupMission(this.missionIndex);
  }

  // ---- garage ----

  buyUpgrade(kind) {
    const def = GARAGE_UPGRADES[kind];
    const level = this.mods[kind];
    if (level >= 3) {
      this.showMessage(def.name + ' is already maxed out.', 2);
      return;
    }
    const price = def.prices[level];
    if (this.player.money < price) {
      this.showMessage('Not enough cash — ' + def.name + ' tier ' + (level + 1) + ' costs $' + price + '.', 2.5);
      return;
    }
    this.player.money -= price;
    this.mods[kind] += 1;
    if (kind === 'paint' && this.player.car) {
      const idx = CAR_COLORS.indexOf(this.player.car.color);
      this.player.car.color = CAR_COLORS[(idx + 1) % CAR_COLORS.length];
    }
    this.sound.cash();
    this.showMessage(def.name + ' tier ' + this.mods[kind] + ' fitted — $' + price + '. ' + def.desc, 2.5);
  }

  // ---- scene entry points (also used by shots.js) ----

  startMenuScene() {
    this.reset(this.shot.seed);
    this.mode = 'menu';
  }

  startPlayScene(opts = {}) {
    this.reset(this.shot.seed);
    this.mode = 'play';
    if (opts.missionIndex != null) this.setupMission(opts.missionIndex, opts.missionStage || 'pickup');
    if (opts.wanted) this.addWanted(opts.wanted);
    if (opts.inCar) {
      let car = null;
      let best = Infinity;
      for (const c of this.city.parkedCars) {
        const d = dist(this.player, c);
        if (d < best) { best = d; car = c; }
      }
      if (car) {
        car.taken = true;
        this.player.car = car;
        this.player.onFoot = false;
        this.player.x = car.x;
        this.player.y = car.y;
        this.player.angle = car.angle;
        car.speed = 240;
      }
    }
    if (this.wanted >= 3) {
      for (let i = 0; i < 3; i++) {
        const spot = randomRoadPoint(this.rng, this.city);
        const cop = this.makeCop(
          Math.max(200, Math.min(WORLD_W - 200, this.player.x + (i - 1) * 260)),
          Math.max(200, Math.min(WORLD_H - 200, this.player.y + 320)),
        );
        cop.x = spot.x; cop.y = spot.y;
        this.cops.push(cop);
      }
    }
    this.showMessage(this.mission ? this.mission.briefing : 'Welcome to Vice Bay', 4);
  }

  showGameOver(reason, override) {
    this.mode = 'over';
    this.overReason = reason;
    if (override) {
      this.player.money = override.money ?? this.player.money;
      this.stats.missionsDone = override.missionsDone ?? this.stats.missionsDone;
    }
    this.saveBest();
    this.sound.busted();
    this.sound.siren(false);
    this.sound.engine(0, false);
  }

  handleClick() {
    this.sound.unlock();
    if (this.mode === 'menu') this.startPlayScene({});
    else if (this.mode === 'over') this.startPlayScene({});
  }

  burst(x, y, color, n, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = rngRange(this.rng, 0, Math.PI * 2);
      const v = rngRange(this.rng, speed * 0.3, speed);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rngRange(this.rng, 0.3, 0.8), maxLife: 0.8,
        color, size: rngRange(this.rng, 2, 5),
      });
    }
  }

  // ---- per-frame update ----

  frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    drawGame(this.ctx, this, this.city);
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.time += dt;
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.roadblockHitCooldown > 0) this.roadblockHitCooldown -= dt;
    if (this.tireTimer > 0) this.tireTimer -= dt;
    if (this.input.wasPressed('KeyM')) {
      this.muted = !this.muted;
      this.sound.setMuted(this.muted);
    }
    if (this.mode === 'menu') {
      this.updateAmbient(dt);
      this.camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, 1100 + Math.sin(this.time * 0.07) * 700));
      this.camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, 900 + Math.cos(this.time * 0.05) * 500));
      if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) this.startPlayScene({});
      return;
    }
    if (this.mode === 'garage') {
      if (this.input.wasPressed('Digit1')) this.buyUpgrade('engine');
      else if (this.input.wasPressed('Digit2')) this.buyUpgrade('armor');
      else if (this.input.wasPressed('Digit3')) this.buyUpgrade('paint');
      if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyG') || this.input.wasPressed('KeyP')) {
        this.mode = 'play';
      }
      return;
    }
    if (this.mode === 'pause') {
      if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.mode = 'play';
      return;
    }
    if (this.mode !== 'play') return;
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) {
      this.mode = 'pause';
      return;
    }
    // Radio: start the loop once audio is unlocked, swap on R.
    if (this.sound.ctx && !this.radioOn) {
      this.sound.startRadio(this.radio);
      this.radioOn = true;
    }
    if (this.input.wasPressed('KeyR')) {
      this.radio = (this.radio + 1) % RADIO_STATIONS.length;
      this.sound.setRadioStation(this.radio);
      const st = RADIO_STATIONS[this.radio];
      this.showMessage('Radio: ' + st.name + ' — ' + st.style, 2);
    }
    // Garage: park beside Rico's shop and press G.
    if (this.input.wasPressed('KeyG') && !this.player.onFoot && this.player.car &&
        dist(this.player, this.city.garage) < 110) {
      this.mode = 'garage';
      this.sound.click();
      return;
    }
    this.updatePlayer(dt);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateCops(dt);
    this.updateEscalation(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updateMissions(dt);
    // Wanted heat cools off when the player keeps their nose clean — unless
    // Air One is overhead, in which case the chopper keeps eyes on you.
    if (this.wanted > 0 && !this.heli) {
      this.crimeTimer += dt;
      const decay = this.respect >= 70 ? 20 : WANTED_DECAY_SECONDS;
      if (this.crimeTimer > decay) {
        this.wanted -= 1;
        this.crimeTimer = 0;
        this.showMessage('Heat dying down… ' + this.wanted + ' star' + (this.wanted === 1 ? '' : 's'), 2);
      }
    }
    // Camera follows the player.
    const px = this.player.x - VIEW_W / 2;
    const py = this.player.y - VIEW_H / 2;
    this.camera.x = Math.max(0, Math.min(WORLD_W - VIEW_W, px));
    this.camera.y = Math.max(0, Math.min(WORLD_H - VIEW_H, py));
    // Engine and siren follow the action.
    const driving = !this.player.onFoot && this.player.car;
    this.sound.engine(driving ? Math.abs(this.player.speed || 0) / this.effMaxSpeed() : 0, !!driving);
    this.sound.siren(this.cops.length > 0);
    if (this.player.hp <= 0) this.showGameOver('wasted');
  }

  updateAmbient(dt) {
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateParticles(dt);
  }

  updatePlayer(dt) {
    const p = this.player;
    const input = this.input;
    const fwd = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);

    // Q swaps weapon slots, on foot or behind the wheel.
    if (input.wasPressed('KeyQ')) {
      this.weapon = (this.weapon + 1) % WEAPONS.length;
      this.showMessage('Weapon: ' + WEAPONS[this.weapon].name, 1.5);
    }

    if (p.onFoot) {
      let mx = strafe;
      let my = -fwd; // W is up on screen
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= len; my /= len;
        p.angle = Math.atan2(my, mx);
        const slow = isWater(p.x, p.y) ? 0.5 : 1;
        p.x += mx * PLAYER_WALK_SPEED * slow * dt;
        p.y += my * PLAYER_WALK_SPEED * slow * dt;
      }
      const fixed = resolveBuildingCollision(p.x, p.y, PLAYER_RADIUS, this.city.buildings);
      p.x = fixed.x; p.y = fixed.y;
      const clamped = clampToWorld(p.x, p.y, 24);
      p.x = clamped.x; p.y = clamped.y;

      if (input.wasPressed('KeyE')) this.tryEnterCar();
      if (input.wasPressed('KeyJ')) this.punch();
      if (input.wasPressed('KeyK')) this.shoot();
      return;
    }

    // Driving.
    const car = p.car;
    if (!car) { p.onFoot = true; return; }
    const speed = p.speed || 0;
    const top = this.effMaxSpeed();
    if (fwd > 0) p.speed = Math.min(top, speed + CAR_ACCEL * dt);
    else if (fwd < 0) {
      p.speed = speed > 20 ? Math.max(0, speed - CAR_BRAKE * dt) : Math.max(-CAR_REVERSE_SPEED, speed - CAR_ACCEL * 0.6 * dt);
    } else {
      p.speed = speed * Math.max(0, 1 - CAR_DRAG * dt);
      if (Math.abs(p.speed) < 4) p.speed = 0;
    }
    const steer = strafe * CAR_TURN * dt * Math.min(1, Math.abs(p.speed) / 140) * (p.speed >= 0 ? 1 : -1);
    p.angle += steer;
    car.angle = p.angle;
    const nx = p.x + Math.cos(p.angle) * p.speed * dt;
    const ny = p.y + Math.sin(p.angle) * p.speed * dt;
    const fixed = resolveBuildingCollision(nx, ny, 22, this.city.buildings);
    if ((fixed.x !== nx || fixed.y !== ny) && Math.abs(p.speed) > 200) {
      this.sound.crash();
      this.burst(p.x, p.y, '#ffb14a', 8);
    }
    if (fixed.x !== nx || fixed.y !== ny) p.speed *= 0.4;
    p.x = fixed.x; p.y = fixed.y;
    const clamped = clampToWorld(p.x, p.y, 30);
    p.x = clamped.x; p.y = clamped.y;
    car.x = p.x; car.y = p.y;
    // Roadblocks stop a car cold; spike strips shred the tires.
    for (const rb of this.roadblocks) {
      if (dist(p, rb) < 38 && this.roadblockHitCooldown <= 0) {
        this.roadblockHitCooldown = 1.2;
        p.speed *= 0.2;
        this.sound.crash();
        this.burst(p.x, p.y, '#ffb14a', 12);
        this.showMessage('Roadblock! BBPD has the street sealed.', 2);
      }
    }
    for (const sp of this.spikes) {
      if (dist(p, sp) < 32 && this.tireTimer <= 0) {
        this.tireTimer = 6;
        p.speed *= 0.2;
        this.sound.crash();
        this.burst(p.x, p.y, '#d8d8d8', 10);
        this.showMessage('Spike strip! Tires shredded — 6s of limp speed.', 2.5);
      }
    }
    // Running someone over is a crime the whole street sees.
    for (const ped of this.peds) {
      if (ped.alive && dist(p, ped) < 26) {
        ped.alive = false;
        this.burst(ped.x, ped.y, '#ff5a5a', 10);
        this.addWanted(1);
        this.showMessage('You ran someone over! The law is coming.', 2.5);
      }
    }
    // Bump traffic.
    for (const t of this.traffic) {
      if (dist(p, t) < 40 && Math.abs(p.speed) > 60) {
        t.speed = Math.max(40, t.speed * 0.5);
        p.speed *= 0.6;
        this.sound.crash();
        this.burst(t.x, t.y, '#d8d8d8', 6);
      }
    }
    if (input.wasPressed('KeyE')) {
      // Step out beside the car; it stays where it was left.
      p.onFoot = true;
      p.car = null;
      p.x += Math.cos(p.angle + Math.PI / 2) * 34;
      p.y += Math.sin(p.angle + Math.PI / 2) * 34;
      p.speed = 0;
      this.sound.engine(0, false);
    }
    if (input.wasPressed('KeyK')) this.shoot();
  }

  tryEnterCar() {
    const p = this.player;
    let bestCar = null;
    let best = 70;
    for (const car of this.city.parkedCars) {
      if (car.taken) continue;
      const d = dist(p, car);
      if (d < best) { best = d; bestCar = car; }
    }
    if (!bestCar) return;
    bestCar.taken = true;
    p.car = bestCar;
    p.onFoot = false;
    p.x = bestCar.x;
    p.y = bestCar.y;
    p.angle = bestCar.angle;
    p.speed = 0;
    this.sound.pickup();
    const copNear = this.cops.some((c) => dist(p, c) < 520);
    if (copNear) {
      this.addWanted(1);
      this.showMessage('Grand theft auto — right in front of a cop!', 2.5);
    } else {
      this.showMessage('Nice ride. Drive safe… or don\'t.', 2);
    }
  }

  punch() {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = PUNCH_COOLDOWN;
    this.sound.punch();
    const p = this.player;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (dist(p, ped) < PUNCH_REACH) {
        ped.alive = false;
        ped.flee = true;
        this.burst(ped.x, ped.y, '#ffd94a', 8);
        if (this.rng() < 0.5) {
          p.money += 10;
          this.showMessage('Pocketed $10 off the pavement.', 2);
        }
        this.addWanted(1);
        return;
      }
    }
  }

  shoot() {
    if (this.shootCooldown > 0) return;
    const w = WEAPONS[this.weapon];
    this.shootCooldown = w.cooldown;
    const p = this.player;
    const gx = p.x + Math.cos(p.angle) * 22;
    const gy = p.y + Math.sin(p.angle) * 22;
    for (let i = 0; i < w.pellets; i++) {
      const off = w.pellets === 1 ? 0 : (i - (w.pellets - 1) / 2) * (w.spread / (w.pellets - 1));
      const a = p.angle + off;
      this.bullets.push({
        x: gx, y: gy,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: w.range / BULLET_SPEED, fromCop: false, damage: w.damage,
      });
    }
    this.sound.shot();
    this.addWanted(1);
  }

  updateTraffic(dt) {
    for (const t of this.traffic) {
      // Slow down for the car ahead so traffic bunches up like traffic.
      let target = t.speed;
      for (const o of this.traffic) {
        if (o === t) continue;
        const dx = o.x - t.x;
        const dy = o.y - t.y;
        const ahead = Math.cos(t.angle) * dx + Math.sin(t.angle) * dy;
        if (ahead > 0 && ahead < 70 && Math.abs(-Math.sin(t.angle) * dx + Math.cos(t.angle) * dy) < 26) {
          target = Math.min(target, o.speed * 0.6);
        }
      }
      t.x += Math.cos(t.angle) * target * dt;
      t.y += Math.sin(t.angle) * target * dt;
      // Wrap around the far edge so the streets never empty out.
      if (t.vertical) {
        if (t.y < 160) t.y = WORLD_H - 160;
        if (t.y > WORLD_H - 160) t.y = 160;
      } else {
        if (t.x < 200) t.x = WORLD_W - 200;
        if (t.x > WORLD_W - 200) t.x = 200;
      }
    }
  }

  updatePeds(dt) {
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      const d = Math.hypot(ped.tx - ped.x, ped.ty - ped.y);
      if (d < 12) {
        if (ped.flee) { ped.flee = false; }
        const spot = randomPavementPoint(this.rng, this.city);
        ped.tx = spot.x; ped.ty = spot.y;
        ped.wait = rngRange(this.rng, 0, 2.5);
        continue;
      }
      const ang = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      ped.angle = ang;
      const speed = ped.flee ? ped.speed * 2.4 : ped.speed;
      ped.x += Math.cos(ang) * speed * dt;
      ped.y += Math.sin(ang) * speed * dt;
    }
  }

  updateCops(dt) {
    // Respect talks: at Runner rank the crew's tip-offs keep one patrol
    // car off your tail.
    let want = this.wanted > 0 ? Math.min(1 + this.wanted, 5) : 0;
    if (this.respect >= 70) want = Math.max(0, want - 1);
    while (this.cops.length < want) {
      const spot = randomRoadPoint(this.rng, this.city);
      let cx = spot.x;
      let cy = spot.y;
      if (dist({ x: cx, y: cy }, this.player) < 320) {
        cx = Math.max(200, Math.min(WORLD_W - 200, this.player.x + 420));
        cy = Math.max(200, Math.min(WORLD_H - 200, this.player.y - 300));
      }
      this.cops.push(this.makeCop(cx, cy));
    }
    if (this.wanted === 0) {
      // Heat gone: patrol cars drift off and despawn at range.
      this.cops = this.cops.filter((c) => dist(c, this.player) < 900);
    }
    for (const cop of this.cops) {
      let d = dist(cop, this.player);
      // A cop that stops closing in is grinding against a building: after
      // a couple of seconds with no progress, drop it back onto a road
      // near the player so the chase stays live instead of stalling out.
      if (this.wanted > 0) {
        if (cop.lastDist == null) cop.lastDist = d;
        if (d > cop.lastDist - 2) cop.stuck = (cop.stuck || 0) + dt;
        else cop.stuck = 0;
        cop.lastDist = d;
        if ((cop.stuck || 0) > 2.5) {
          // Aim for a road point ~550 px out; keep the closest attempt
          // instead of a blind last try so a cop never lands across town.
          let spot = randomRoadPoint(this.rng, this.city);
          let bestScore = Math.abs(dist(spot, this.player) - 550);
          for (let tries = 0; tries < 40; tries++) {
            const cand = randomRoadPoint(this.rng, this.city);
            const score = Math.abs(dist(cand, this.player) - 550);
            if (score < bestScore) { spot = cand; bestScore = score; }
            if (bestScore < 120) break;
          }
          cop.x = spot.x;
          cop.y = spot.y;
          cop.speed = 0;
          cop.stuck = 0;
          cop.lastDist = dist(cop, this.player);
          d = dist(cop, this.player);
        }
      }
      const targetAngle = angleTo(cop, this.player);
      const top = 360 + this.wanted * 26;
      cop.speed = Math.min(top, cop.speed + 320 * dt);
      cop.angle = turnToward(cop.angle, targetAngle, 2.2 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      const fixed = resolveBuildingCollision(cop.x, cop.y, 22, this.city.buildings);
      cop.x = fixed.x; cop.y = fixed.y;
      // Ram the player. Garage armor takes the edge off.
      if (d < 36 && this.hitCooldown <= 0) {
        this.hitCooldown = 0.7;
        this.player.hp -= Math.max(2, 7 - 2 * this.mods.armor);
        this.sound.crash();
        this.burst(this.player.x, this.player.y, '#ff5a5a', 10);
        if (!this.player.onFoot && this.player.car) this.player.speed *= 0.5;
      }
      // On foot and cornered: the bust meter fills.
      if (this.player.onFoot && d < 34) {
        this.bustMeter += dt;
        if (this.bustMeter >= 1.2) this.showGameOver('busted');
      } else {
        this.bustMeter = Math.max(0, this.bustMeter - dt * 0.8);
      }
      // At three stars and up, cops open fire at range.
      if (this.wanted >= 3 && d < 430 && d > 90) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = rngRange(this.rng, 1.4, 2.2);
          const a = angleTo(cop, this.player) + rngRange(this.rng, -0.08, 0.08);
          this.bullets.push({
            x: cop.x + Math.cos(a) * 24, y: cop.y + Math.sin(a) * 24,
            vx: Math.cos(a) * BULLET_SPEED * 0.8, vy: Math.sin(a) * BULLET_SPEED * 0.8,
            life: 0.9, fromCop: true, damage: 5,
          });
          this.sound.shot();
        }
      }
    }
  }

  // Police escalation: roadblocks at 3 stars, Air One and spike strips
  // at 4 stars. Everything is placed on the road ahead of the player and
  // re-laid once the player blows past it.
  updateEscalation(dt) {
    const p = this.player;
    if (this.wanted >= 3) {
      while (this.roadblocks.length < 2) {
        const ahead = snapToRoad(
          p.x + Math.cos(p.angle) * 560, p.y + Math.sin(p.angle) * 560, this.city);
        this.roadblocks.push({ x: ahead.x, y: ahead.y, vertical: ahead.vertical });
      }
      for (let i = 0; i < this.roadblocks.length; i++) {
        const rb = this.roadblocks[i];
        if (dist(p, rb) > 850) {
          const ahead = snapToRoad(
            p.x + Math.cos(p.angle) * 560, p.y + Math.sin(p.angle) * 560, this.city);
          this.roadblocks[i] = { x: ahead.x, y: ahead.y, vertical: ahead.vertical };
        }
      }
    } else {
      this.roadblocks = [];
    }
    if (this.wanted >= 4) {
      if (!this.heli) this.heli = { x: p.x - 120, y: p.y - 160 };
      // The chopper shadows the player from above, spotlight sweeping.
      const hx = this.heli.x + (p.x - 60 - this.heli.x) * Math.min(1, dt * 1.6);
      const hy = this.heli.y + (p.y - 80 - this.heli.y) * Math.min(1, dt * 1.6);
      this.heli.x = hx;
      this.heli.y = hy;
      while (this.spikes.length < 1) {
        const ahead = snapToRoad(
          p.x + Math.cos(p.angle) * 420, p.y + Math.sin(p.angle) * 420, this.city);
        this.spikes.push({ x: ahead.x, y: ahead.y, vertical: ahead.vertical });
      }
      for (let i = 0; i < this.spikes.length; i++) {
        const sp = this.spikes[i];
        if (dist(p, sp) > 800) {
          const ahead = snapToRoad(
            p.x + Math.cos(p.angle) * 420, p.y + Math.sin(p.angle) * 420, this.city);
          this.spikes[i] = { x: ahead.x, y: ahead.y, vertical: ahead.vertical };
        }
      }
    } else {
      this.heli = null;
      this.spikes = [];
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.fromCop) {
        if (dist(b, this.player) < 16) {
          this.player.hp -= b.damage || 5;
          b.life = 0;
          this.burst(b.x, b.y, '#ff5a5a', 6);
        }
        continue;
      }
      for (const ped of this.peds) {
        if (ped.alive && dist(b, ped) < 14) {
          ped.alive = false;
          b.life = 0;
          this.burst(ped.x, ped.y, '#ff5a5a', 10);
          this.addWanted(1);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of this.cops) {
        if (dist(b, cop) < 24) {
          cop.hp -= b.damage || 34;
          b.life = 0;
          this.burst(b.x, b.y, '#ffb14a', 8);
          if (cop.hp <= 0) {
            this.burst(cop.x, cop.y, '#ff5a5a', 26, 260);
            this.burst(cop.x, cop.y, '#3a3a3a', 18, 200);
            this.player.money += 50;
            this.addWanted(1);
            this.showMessage('Cop car down! +$50, but the heat is on.', 2.5);
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const t of this.traffic) {
        if (dist(b, t) < 24) {
          t.speed = Math.max(30, t.speed * 0.4);
          b.life = 0;
          this.burst(b.x, b.y, '#d8d8d8', 6);
          break;
        }
      }
    }
    this.cops = this.cops.filter((c) => c.hp > 0);
    this.bullets = this.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < WORLD_W && b.y > 0 && b.y < WORLD_H);
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  updateMissions(dt) {
    if (this.fareTimer > 0 && !this.mission) {
      this.fareTimer -= dt;
      if (this.fareTimer <= 0) this.setupRepeatFare();
      return;
    }
    const m = this.mission;
    if (!m) return;
    // Repeat fares have a single flat target, not stages.
    if (m.id === 'fare') {
      if (dist(this.player, m.target) < 70) this.completeMission();
      return;
    }
    // Whole-job clock (races, rescues, getaways).
    if (m.timer != null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        this.failMission('Out of time');
        return;
      }
    }
    const stage = m.stages[m.stageIdx];
    if (!stage) return;
    if (stage.timer != null) {
      stage.timer -= dt;
      if (stage.timer <= 0) {
        this.failMission('Too slow — the parcel job went to someone else');
        return;
      }
    }
    if (dist(this.player, stage.target) < 70) {
      if (m.id === 'taxi' && m.stageIdx === 0) {
        this.showMessage('Fare aboard — take them to the Marina.', 2.5);
      } else if (m.id === 'parcel' && m.stageIdx === 0) {
        this.showMessage('Parcel collected — 75 seconds, go!', 2.5);
      } else if (m.id === 'escort' && m.stageIdx === 0) {
        this.showMessage('Crates loaded. The harbour patrol is watching — stay smooth.', 2.5);
      } else if (m.id === 'rescue' && m.stageIdx === 0) {
        this.showMessage('Rico is with you! Get him to the safehouse, now!', 2.5);
      } else if (m.id === 'race') {
        this.showMessage(m.stageIdx < 2 ? 'Checkpoint! Next one — keep it pinned.' : 'Finish line!', 2);
      }
      this.advanceStage();
    }
  }
}

function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  applyShot(game, game.shot.shot, game.shot.seed);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
