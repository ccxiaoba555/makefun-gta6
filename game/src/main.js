// Vice Bay — the game loop and all the rules.
// Owns the player, traffic, pedestrians, police, bullets and the three jobs,
// and hands each frame to render.js to draw. The city itself lives in
// world.js; the look lives in render.js; this file is only the rules.

import {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, PLAYER_WALK_SPEED, PLAYER_HP, PLAYER_RADIUS,
  CAR_ACCEL, CAR_MAX_SPEED, CAR_REVERSE_SPEED, CAR_TURN, CAR_BRAKE, CAR_DRAG,
  MAX_WANTED, WANTED_DECAY_SECONDS, BULLET_SPEED, BULLET_RANGE,
  SHOOT_COOLDOWN, PUNCH_COOLDOWN, PUNCH_REACH, PARCEL_TIME_LIMIT,
  MISSIONS, CAR_COLORS, SAVE_KEY,
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
    this.message = '';
    this.messageTimer = 0;
    this.muted = false;
    this.stats = { missionsDone: 0, earned: 0 };
    this.missionIndex = 0;
    this.camera = { x: 900, y: 500 };
    for (const car of this.city.parkedCars) car.taken = false;
    for (let i = 0; i < 14; i++) this.traffic.push(this.makeTrafficCar());
    for (let i = 0; i < 18; i++) this.peds.push(this.makePed());
    this.setupMission(0, 'pickup');
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

  setupMission(index, stage) {
    this.missionIndex = index;
    const def = MISSIONS[index];
    if (!def) { this.mission = null; return; }
    const city = this.city;
    if (def.id === 'taxi') {
      this.mission = {
        id: def.id, name: def.name, briefing: def.briefing, reward: def.reward,
        stage, timer: null,
        target: stage === 'pickup'
          ? { x: city.taxiStand.x, y: city.taxiStand.y, label: 'PICK UP FARE' }
          : { x: city.marina.x, y: city.marina.y, label: 'DROP OFF' },
      };
    } else if (def.id === 'parcel') {
      this.mission = {
        id: def.id, name: def.name, briefing: def.briefing, reward: def.reward,
        stage, timer: stage === 'deliver' ? PARCEL_TIME_LIMIT : null,
        target: stage === 'pickup'
          ? { x: city.depot.x, y: city.depot.y, label: 'COLLECT PARCEL' }
          : { x: city.marina.x, y: city.marina.y, label: 'DELIVER PARCEL' },
      };
    } else {
      this.mission = {
        id: def.id, name: def.name, briefing: def.briefing, reward: def.reward,
        stage: 'escape', timer: null,
        target: { x: city.safehouse.x, y: city.safehouse.y, label: 'SAFEHOUSE' },
      };
    }
  }

  setupRepeatFare() {
    const spot = this.city[rngPick(this.rng, LANDMARKS)];
    this.mission = {
      id: 'fare', name: 'Taxi Fare', briefing: 'A fare is waiting — get them across town.',
      reward: rngInt(this.rng, 90, 150), stage: 'fare', timer: null,
      target: { x: spot.x, y: spot.y, label: 'FARE HERE' },
    };
  }

  completeMission() {
    const m = this.mission;
    this.player.money += m.reward;
    this.stats.earned += m.reward;
    this.stats.missionsDone += 1;
    this.sound.cash();
    this.showMessage('Job done! +$' + m.reward, 3);
    this.saveBest();
    if (m.id === 'taxi') this.setupMission(1, 'pickup');
    else if (m.id === 'parcel') { this.setupMission(2, 'escape'); this.addWanted(3); }
    else if (m.id === 'escape') {
      this.wanted = 0;
      this.cops = [];
      this.mission = null;
      this.fareTimer = 6;
      this.showMessage('Clean getaway — Vice Bay is yours. More fares coming.', 4);
    } else {
      this.mission = null;
      this.fareTimer = 5;
    }
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
    if (this.mode === 'pause') {
      if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.mode = 'play';
      return;
    }
    if (this.mode !== 'play') return;
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) {
      this.mode = 'pause';
      return;
    }
    this.updatePlayer(dt);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateCops(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updateMissions(dt);
    // Wanted heat cools off when the player keeps their nose clean.
    if (this.wanted > 0) {
      this.crimeTimer += dt;
      if (this.crimeTimer > WANTED_DECAY_SECONDS) {
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
    this.sound.engine(driving ? Math.abs(this.player.speed || 0) / CAR_MAX_SPEED : 0, !!driving);
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
    if (fwd > 0) p.speed = Math.min(CAR_MAX_SPEED, speed + CAR_ACCEL * dt);
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
    this.shootCooldown = SHOOT_COOLDOWN;
    const p = this.player;
    const gx = p.x + Math.cos(p.angle) * 22;
    const gy = p.y + Math.sin(p.angle) * 22;
    this.bullets.push({
      x: gx, y: gy,
      vx: Math.cos(p.angle) * BULLET_SPEED,
      vy: Math.sin(p.angle) * BULLET_SPEED,
      life: BULLET_RANGE / BULLET_SPEED, fromCop: false,
    });
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
    const want = this.wanted > 0 ? Math.min(1 + this.wanted, 5) : 0;
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
      const d = dist(cop, this.player);
      const targetAngle = angleTo(cop, this.player);
      const top = 360 + this.wanted * 26;
      cop.speed = Math.min(top, cop.speed + 320 * dt);
      cop.angle = turnToward(cop.angle, targetAngle, 2.2 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      const fixed = resolveBuildingCollision(cop.x, cop.y, 22, this.city.buildings);
      cop.x = fixed.x; cop.y = fixed.y;
      // Ram the player.
      if (d < 36 && this.hitCooldown <= 0) {
        this.hitCooldown = 0.7;
        this.player.hp -= 7;
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
            life: 0.9, fromCop: true,
          });
          this.sound.shot();
        }
      }
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
          this.player.hp -= 5;
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
          cop.hp -= 34;
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
    if (m.timer != null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        this.showMessage('Too slow — the parcel job went to someone else.', 3);
        this.setupMission(1, 'pickup');
        return;
      }
    }
    if (dist(this.player, m.target) < 70) {
      if (m.id === 'taxi' && m.stage === 'pickup') {
        this.setupMission(0, 'dropoff');
        this.sound.pickup();
        this.showMessage('Fare aboard — take them to the Marina.', 2.5);
      } else if (m.id === 'parcel' && m.stage === 'pickup') {
        this.setupMission(1, 'deliver');
        this.sound.pickup();
        this.showMessage('Parcel collected — 75 seconds, go!', 2.5);
      } else {
        this.completeMission();
      }
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
