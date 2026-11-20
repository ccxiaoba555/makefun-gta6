// Vice Bay rules: no drawing, no browser in here. A top-down open world
// (3200x2400) with a road grid, traffic, pedestrians, police, wanted stars,
// three chained missions, melee + pistol combat and pickups. step() advances
// one fixed step and returns what happened as bit flags, so the caller can
// play sounds without the world knowing about screens or audio.
// ?seed=N fixes the layout and the traffic, so replays are repeatable.
import {
  CAR, MISSIONS, PALETTE, PEDS, PLAYER, POLICE, ROADS_X, ROADS_Y, ROAD_W,
  SPOTS, TRAFFIC, WANTED, WORLD,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_CRASH = 8;
export const EVENT_SHOT = 16;
export const EVENT_MISSION = 32;
export const EVENT_WANTED = 64;
export const EVENT_PUNCH = 128;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_W / 2 + 14) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_W / 2 + 14) return true;
  return false;
}
// Nearest point on the road network (used to drop pickups / spawn peds on streets).
function roadPoint(random) {
  if (random() < 0.5) {
    return { x: ROADS_X[Math.floor(random() * ROADS_X.length)] + (random() - 0.5) * (ROAD_W - 30), y: 120 + random() * (WORLD.height - 240) };
  }
  return { x: 120 + random() * (WORLD.width - 240), y: ROADS_Y[Math.floor(random() * ROADS_Y.length)] + (random() - 0.5) * (ROAD_W - 30) };
}

export function createWorld(random) {
  const player = {
    x: SPOTS.playerStart.x, y: SPOTS.playerStart.y, angle: -Math.PI / 2,
    hp: PLAYER.hp, money: 0, ammo: PLAYER.startAmmo, wanted: 0,
    inCar: false, car: null, punchCd: 0, shootCd: 0, invuln: 0, moving: false,
  };
  const cars = [];
  const peds = [];
  const bullets = [];
  const pickups = [];
  const buildings = [];
  const trees = [];
  const state = {
    player, cars, peds, bullets, pickups, buildings, trees,
    mission: { index: 0, stage: 'pickup', target: { ...SPOTS.taxiPickup }, timer: 0, banner: '', bannerTimer: 0 },
    camera: { x: 0, y: 0 },
    time: 0, wantedTimer: 0, policeTimer: 0, pickupTimer: 0, over: false,
  };

  function buildCity() {
    buildings.length = 0;
    trees.length = 0;
    for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
      for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
        const x0 = ROADS_X[ix] + ROAD_W / 2 + 18;
        const y0 = ROADS_Y[iy] + ROAD_W / 2 + 18;
        const x1 = ROADS_X[ix + 1] - ROAD_W / 2 - 18;
        const y1 = ROADS_Y[iy + 1] - ROAD_W / 2 - 18;
        if (x1 - x0 < 90 || y1 - y0 < 90) continue;
        const n = random() < 0.55 ? 2 : 1;
        for (let b = 0; b < n; b += 1) {
          const w = 90 + random() * 110;
          const h = 80 + random() * 100;
          const bx = x0 + random() * Math.max(1, (x1 - x0 - w) / (n === 2 ? 1 : 1));
          const by = y0 + (b * (y1 - y0)) / 2 + random() * Math.max(1, (y1 - y0) / 2 - h);
          buildings.push({
            x: clamp(bx, x0, x1 - w), y: clamp(by, y0, y1 - h), w, h,
            color: PALETTE.building[Math.floor(random() * PALETTE.building.length)],
          });
        }
        if (random() < 0.7) trees.push({ x: x0 + random() * (x1 - x0), y: y0 + random() * (y1 - y0), r: 12 + random() * 8 });
      }
    }
  }

  function addParked(x, y, angle, color, kind) {
    const car = { x, y, angle, speed: 0, color, kind, hp: 60, hitCd: 0, axis: 'v', dir: 1, turnCd: 0, owned: kind === 'parked' };
    cars.push(car);
    return car;
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random() < 0.5;
      const lane = (random() < 0.5 ? -1 : 1) * 28;
      let x; let y; let angle;
      if (vertical) {
        x = ROADS_X[Math.floor(random() * ROADS_X.length)] + lane;
        y = 120 + random() * (WORLD.height - 240);
        angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = 120 + random() * (WORLD.width - 240);
        y = ROADS_Y[Math.floor(random() * ROADS_Y.length)] + lane;
        angle = random() < 0.5 ? 0 : Math.PI;
      }
      cars.push({
        x, y, angle, speed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
        color: PALETTE.traffic[Math.floor(random() * PALETTE.traffic.length)],
        kind: 'traffic', hp: 60, hitCd: 0, axis: vertical ? 'v' : 'h', dir: angle === 0 || angle === Math.PI / 2 ? 1 : -1, turnCd: 1 + random() * 2,
      });
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const p = roadPoint(random);
      peds.push({
        x: p.x, y: p.y, angle: random() * TAU, speed: PEDS.speedMin + random() * (PEDS.speedMax - PEDS.speedMin),
        tx: p.x, ty: p.y, down: 0, color: PALETTE.ped[Math.floor(random() * PALETTE.ped.length)],
      });
    }
  }

  function spawnPickup(kind) {
    const p = roadPoint(random);
    pickups.push({ x: p.x, y: p.y, kind, bob: random() * TAU });
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    bullets.length = 0;
    pickups.length = 0;
    buildCity();
    // The starter taxi sits by the player's spawn; taking it is free.
    addParked(SPOTS.playerStart.x + 90, SPOTS.playerStart.y, 0, PALETTE.taxi, 'taxi');
    // Owned parked cars along the roads: taking one is stealing (+1 star).
    const spots = [
      [1000, 1060, Math.PI / 2], [1400, 460, 0], [2200, 660, Math.PI], [1800, 1460, 0],
      [600, 460, Math.PI / 2], [2600, 1060, Math.PI], [1000, 1860, 0], [2600, 1860, Math.PI / 2],
    ];
    for (const [x, y, a] of spots) {
      addParked(x, y, a, PALETTE.traffic[Math.floor(random() * PALETTE.traffic.length)], 'parked');
    }
    spawnTraffic();
    spawnPeds();
    spawnPickup('ammo');
    spawnPickup('health');
    spawnPickup('ammo');
    spawnPickup('cash');
    Object.assign(player, {
      x: SPOTS.playerStart.x, y: SPOTS.playerStart.y, angle: -Math.PI / 2,
      hp: PLAYER.hp, money: 0, ammo: PLAYER.startAmmo, wanted: 0,
      inCar: false, car: null, punchCd: 0, shootCd: 0, invuln: 0, moving: false,
    });
    state.mission = {
      index: 0, stage: 'pickup', target: { ...SPOTS.taxiPickup }, timer: 0,
      banner: 'Job 1/3 — Taxi Fare: pick up the fare at the yellow marker.', bannerTimer: 5,
    };
    state.time = 0;
    state.wantedTimer = 0;
    state.policeTimer = 0;
    state.pickupTimer = 6;
    state.over = false;
    updateCamera();
  }

  function updateCamera() {
    state.camera.x = clamp(player.x - 1280 / 2, 0, WORLD.width - 1280);
    state.camera.y = clamp(player.y - 720 / 2, 0, WORLD.height - 720);
  }

  // Push a circle out of every building rect; returns true if it hit one.
  function collideBuildings(e, r) {
    let hit = false;
    for (const b of buildings) {
      const cx = clamp(e.x, b.x, b.x + b.w);
      const cy = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - cx; const dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          e.x = cx + (dx / d) * r;
          e.y = cy + (dy / d) * r;
        } else {
          e.y = b.y - r;
        }
      }
    }
    return hit;
  }

  function raiseWanted(n) {
    const before = player.wanted;
    player.wanted = Math.min(WANTED.maxStars, player.wanted + n);
    if (player.wanted > before) {
      state.wantedTimer = 0;
      return true;
    }
    return false;
  }

  function policeTargetCount() {
    return player.wanted === 0 ? 0 : player.wanted + 1;
  }

  function spawnPolice() {
    // Appear on a road a little way off, so the chase reads on screen.
    const p = roadPoint(random);
    const dx = p.x - player.x; const dy = p.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const car = {
      x: clamp(player.x + (dx / d) * 560, 60, WORLD.width - 60),
      y: clamp(player.y + (dy / d) * 560, 60, WORLD.height - 60),
      angle: Math.atan2(player.y - p.y, player.x - p.x), speed: 240,
      color: PALETTE.police, kind: 'police', hp: 80, hitCd: 0, axis: 'v', dir: 1, turnCd: 0,
    };
    cars.push(car);
    return car;
  }

  function missionBanner(text, seconds = 4) {
    state.mission.banner = text;
    state.mission.bannerTimer = seconds;
  }

  function completeMission() {
    const m = MISSIONS[state.mission.index];
    player.money += m.reward;
    state.mission.index += 1;
    if (state.mission.index >= MISSIONS.length) {
      state.mission.stage = 'done';
      state.mission.target = null;
      missionBanner(`All jobs done! +$${m.reward}. Vice Bay is yours — free roam.`, 6);
      return EVENT_MISSION;
    }
    const next = MISSIONS[state.mission.index];
    state.mission.stage = 'pickup';
    state.mission.timer = 0;
    state.mission.target = state.mission.index === 1 ? { ...SPOTS.parcelPickup } : { ...SPOTS.safehouse };
    if (state.mission.index === 2) {
      player.wanted = WANTED.maxStars;
      missionBanner(`Job 3/3 — ${next.name}: +$${m.reward} banked. ${next.intro}`, 6);
    } else {
      missionBanner(`Job ${state.mission.index + 1}/3 — ${next.name}: +$${m.reward} banked. ${next.intro}`, 6);
    }
    return EVENT_MISSION;
  }

  function failMission(reason) {
    const m = MISSIONS[state.mission.index];
    state.mission.stage = 'pickup';
    state.mission.timer = 0;
    state.mission.target = state.mission.index === 1 ? { ...SPOTS.parcelPickup } : { ...SPOTS.taxiPickup };
    missionBanner(`${reason} — ${m.name} failed. Try again.`, 5);
    return EVENT_MISSION;
  }

  function stepMission(dt) {
    const mi = state.mission;
    if (mi.index >= MISSIONS.length || mi.stage === 'done') return 0;
    if (mi.bannerTimer > 0) mi.bannerTimer -= dt;
    if (mi.stage === 'dropoff' && MISSIONS[mi.index].timeLimit > 0) {
      mi.timer -= dt;
      if (mi.timer <= 0) return failMission('Out of time!');
    }
    if (!mi.target) return 0;
    const d = dist(player.x, player.y, mi.target.x, mi.target.y);
    if (d > 80) return 0;
    if (mi.stage === 'pickup') {
      if (mi.index === 0) {
        mi.stage = 'dropoff';
        mi.target = { ...SPOTS.taxiDrop };
        missionBanner('Passenger aboard! Drive them to the hotel (south-east).', 4);
      } else if (mi.index === 1) {
        mi.stage = 'dropoff';
        mi.target = { ...SPOTS.parcelDrop };
        mi.timer = MISSIONS[1].timeLimit;
        missionBanner('Parcel grabbed! Deliver it before the timer runs out!', 4);
      } else if (mi.index === 2) {
        return completeMission();
      }
      return EVENT_MISSION;
    }
    // dropoff reached
    return completeMission();
  }

  function stepPlayer(dt, input, harmless) {
    if (player.punchCd > 0) player.punchCd -= dt;
    if (player.shootCd > 0) player.shootCd -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    let events = 0;
    const car = player.car;

    if (input.enter && !player.inCar) {
      // Find the nearest parked/taxi car to steal or take.
      let bestCar = null; let bestD = 80;
      for (const c of cars) {
        if (c.kind !== 'parked' && c.kind !== 'taxi') continue;
        const d = dist(player.x, player.y, c.x, c.y);
        if (d < bestD) { bestD = d; bestCar = c; }
      }
      if (bestCar) {
        player.inCar = true;
        player.car = bestCar;
        bestCar.kind = 'player';
        player.angle = bestCar.angle;
        player.x = bestCar.x;
        player.y = bestCar.y;
        // Taking an owned car is grand theft auto; the taxi is free.
        if (!harmless && bestCar.owned) {
          bestCar.owned = false;
          if (raiseWanted(1)) events |= EVENT_WANTED;
        }
      }
    } else if (input.enter && player.inCar && car) {
      // Step out beside the car; it stays yours, so getting back in is free.
      player.inCar = false;
      car.kind = 'parked';
      car.owned = false;
      car.speed = 0;
      player.car = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
      player.angle = car.angle;
    }

    if (player.inCar && car) {
      // Driving: y = throttle (up = gas, down = brake/reverse), x = steering.
      const throttle = input.y;
      const steer = input.x;
      if (throttle > 0) car.speed += CAR.accel * dt;
      else if (throttle < 0) car.speed -= (car.speed > 20 ? CAR.brake : CAR.accel * 0.6) * dt;
      else car.speed -= car.speed * CAR.drag * dt;
      car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
      const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1);
      car.angle += steer * CAR.turnRate * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      car.x = nx; car.y = ny;
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      player.moving = Math.abs(car.speed) > 20;
      const speedBefore = car.speed;
      if (collideBuildings(car, 34)) {
        if (Math.abs(speedBefore) > 200 && !harmless) events |= EVENT_CRASH;
        car.speed *= -0.25;
      }
      car.x = clamp(car.x, 30, WORLD.width - 30);
      car.y = clamp(car.y, 30, WORLD.height - 30);
    } else {
      // On foot: 8-way movement, facing follows motion.
      const mx = input.x; const my = input.y;
      const len = Math.hypot(mx, my) || 1;
      player.moving = mx !== 0 || my !== 0;
      if (player.moving) {
        player.x += (mx / len) * PLAYER.walkSpeed * dt;
        player.y += (my / len) * PLAYER.walkSpeed * dt;
        player.angle = Math.atan2(my, mx);
      }
      collideBuildings(player, PLAYER.radius);
      player.x = clamp(player.x, 20, WORLD.width - 20);
      player.y = clamp(player.y, 20, WORLD.height - 20);
      // Do not walk through cars: push out of any car circle.
      for (const c of cars) {
        const dx = player.x - c.x; const dy = player.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 36 && d > 0.01) {
          player.x = c.x + (dx / d) * 36;
          player.y = c.y + (dy / d) * 36;
        }
      }
    }

    // Punch: short-range melee in front of the player.
    if (input.punch && player.punchCd <= 0 && !player.inCar) {
      player.punchCd = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      if (!harmless) {
        for (const ped of peds) {
          if (ped.down > 0) continue;
          const d = dist(player.x, player.y, ped.x, ped.y);
          if (d < PLAYER.punchRange && Math.abs(angleDiff(Math.atan2(ped.y - player.y, ped.x - player.x), player.angle)) < 1.2) {
            ped.down = 4;
            if (raiseWanted(1)) events |= EVENT_WANTED;
          }
        }
      }
    }
    // Shoot: pistol, limited ammo, fires along the facing angle.
    if (input.shoot && player.shootCd <= 0 && player.ammo > 0) {
      player.shootCd = PLAYER.shootCooldown;
      player.ammo -= 1;
      bullets.push({
        x: player.x + Math.cos(player.angle) * 24, y: player.y + Math.sin(player.angle) * 24,
        vx: Math.cos(player.angle) * PLAYER.bulletSpeed, vy: Math.sin(player.angle) * PLAYER.bulletSpeed,
        travelled: 0,
      });
      events |= EVENT_SHOT;
    }
    return events;
  }

  function stepCars(dt, harmless) {
    let events = 0;
    for (const c of cars) {
      if (c.hitCd > 0) c.hitCd -= dt;
      if (c.kind === 'player') continue; // driven in stepPlayer
      if (c.kind === 'police') {
        // Chase the player: steer toward them, ram on contact.
        const want = Math.atan2(player.y - c.y, player.x - c.x);
        c.angle += clamp(angleDiff(want, c.angle), -2.4 * dt, 2.4 * dt);
        c.speed = Math.min(POLICE.maxSpeed, c.speed + 420 * dt);
        c.x += Math.cos(c.angle) * c.speed * dt;
        c.y += Math.sin(c.angle) * c.speed * dt;
        if (collideBuildings(c, 34)) c.speed *= -0.2;
        c.x = clamp(c.x, 30, WORLD.width - 30);
        c.y = clamp(c.y, 30, WORLD.height - 30);
        const d = dist(c.x, c.y, player.x, player.y);
        if (d < 46 && c.hitCd <= 0) {
          c.hitCd = 0.9;
          c.speed *= 0.4;
          if (!harmless && player.invuln <= 0) {
            player.hp -= player.inCar ? POLICE.ramDamage : 12;
            player.invuln = 0.7;
            events |= EVENT_HIT;
            if (player.hp <= 0) { player.hp = 0; state.over = true; events |= EVENT_OVER; }
          }
        }
        continue;
      }
      if (c.kind === 'traffic') {
        c.turnCd -= dt;
        // At an intersection, sometimes turn onto the crossing road.
        const nearX = ROADS_X.find((rx) => Math.abs(c.x - rx) < 14);
        const nearY = ROADS_Y.find((ry) => Math.abs(c.y - ry) < 14);
        if (c.turnCd <= 0 && ((c.axis === 'v' && nearY !== undefined) || (c.axis === 'h' && nearX !== undefined))) {
          if (random() < 0.5) {
            c.axis = c.axis === 'v' ? 'h' : 'v';
            const goPositive = random() < 0.5;
            c.angle = c.axis === 'h' ? (goPositive ? 0 : Math.PI) : (goPositive ? Math.PI / 2 : -Math.PI / 2);
            c.turnCd = 2 + random() * 3;
          } else {
            c.turnCd = 1.5;
          }
        }
        // Keep to the lane: nudge back onto the road centre line offset.
        if (c.axis === 'v') {
          const roadX = ROADS_X.reduce((a, b) => (Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a));
          const lane = c.angle === Math.PI / 2 ? 28 : -28;
          c.x += clamp(roadX + lane - c.x, -60 * dt, 60 * dt);
          c.y += Math.sin(c.angle) * c.speed * dt;
        } else {
          const roadY = ROADS_Y.reduce((a, b) => (Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a));
          const lane = c.angle === 0 ? 28 : -28;
          c.y += clamp(roadY + lane - c.y, -60 * dt, 60 * dt);
          c.x += Math.cos(c.angle) * c.speed * dt;
        }
        if (collideBuildings(c, 34)) c.speed *= 0.5;
        c.x = clamp(c.x, 30, WORLD.width - 30);
        c.y = clamp(c.y, 30, WORLD.height - 30);
        // A traffic car that runs the player down on foot hurts.
        if (!player.inCar && !harmless && player.invuln <= 0 && dist(c.x, c.y, player.x, player.y) < 40) {
          player.hp -= 15;
          player.invuln = 1;
          events |= EVENT_HIT;
          if (player.hp <= 0) { player.hp = 0; state.over = true; events |= EVENT_OVER; }
        }
        continue;
      }
      // parked / taxi: stationary.
    }
    // Car-car bumps: circles, cheap and stable.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i]; const b = cars[j];
        if ((a.kind === 'parked' || a.kind === 'taxi') && (b.kind === 'parked' || b.kind === 'taxi')) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 58 && d > 0.01) {
          const push = (58 - d) / 2;
          const nx = dx / d; const ny = dy / d;
          // Parked cars do not move; the other car takes the whole push.
          const aFixed = a.kind === 'parked' || a.kind === 'taxi';
          const bFixed = b.kind === 'parked' || b.kind === 'taxi';
          if (!aFixed) { a.x -= nx * push * (bFixed ? 2 : 1); a.y -= ny * push * (bFixed ? 2 : 1); }
          if (!bFixed) { b.x += nx * push * (aFixed ? 2 : 1); b.y += ny * push * (aFixed ? 2 : 1); }
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 160 && !harmless) events |= EVENT_CRASH;
          if (!aFixed) a.speed *= 0.6;
          if (!bFixed) b.speed *= 0.6;
        }
      }
    }
    return events;
  }

  function stepPeds(dt, harmless) {
    let events = 0;
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) {
          // Get up somewhere else in the city.
          const p = roadPoint(random);
          ped.x = p.x; ped.y = p.y;
        }
        continue;
      }
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12) {
        const p = roadPoint(random);
        ped.tx = p.x; ped.ty = p.y;
      } else {
        const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
      }
      collideBuildings(ped, 10);
      // Run over by the player's car: wanted, and the ped goes down.
      if (player.inCar && player.car && Math.abs(player.car.speed) > 60) {
        if (dist(ped.x, ped.y, player.x, player.y) < 40) {
          ped.down = 5;
          if (!harmless && raiseWanted(1)) events |= EVENT_WANTED;
          if (!harmless) events |= EVENT_CRASH;
        }
      }
    }
    return events;
  }

  function stepBullets(dt, harmless) {
    let events = 0;
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += PLAYER.bulletSpeed * dt;
      let dead = b.travelled > PLAYER.bulletRange || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height;
      if (!dead) {
        for (const bl of buildings) {
          if (b.x > bl.x && b.x < bl.x + bl.w && b.y > bl.y && b.y < bl.y + bl.h) { dead = true; break; }
        }
      }
      if (!dead) {
        for (const ped of peds) {
          if (ped.down > 0) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.down = 6;
            dead = true;
            if (!harmless && raiseWanted(1)) events |= EVENT_WANTED;
            break;
          }
        }
      }
      if (!dead) {
        for (const c of cars) {
          if (c.kind === 'player') continue;
          if (dist(b.x, b.y, c.x, c.y) < 34) {
            dead = true;
            if (c.kind === 'police') {
              c.hp -= 34;
              if (c.hp <= 0) { c.kind = 'wreck'; c.speed = 0; }
              if (!harmless && raiseWanted(1)) events |= EVENT_WANTED;
            } else if (c.kind === 'traffic') {
              c.speed = 0;
              c.kind = 'parked';
            }
            break;
          }
        }
      }
      b.dead = dead;
    }
    for (let i = bullets.length - 1; i >= 0; i -= 1) if (bullets[i].dead) bullets.splice(i, 1);
    // Wrecks stop chasing and are cleared after a while by the police spawner.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (cars[i].kind === 'wreck') cars.splice(i, 1);
    }
    return events;
  }

  function stepPickups(dt) {
    let events = 0;
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.bob += dt * 3;
      if (dist(player.x, player.y, p.x, p.y) < 36) {
        if (p.kind === 'ammo') player.ammo += 12;
        else if (p.kind === 'health') player.hp = Math.min(PLAYER.hp, player.hp + 35);
        else player.money += 10;
        pickups.splice(i, 1);
        events |= EVENT_PICKUP;
      }
    }
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0 && pickups.length < 7) {
      spawnPickup(['ammo', 'health', 'cash'][Math.floor(random() * 3)]);
      state.pickupTimer = 7;
    }
    return events;
  }

  function stepWanted(dt, harmless) {
    if (harmless || player.wanted === 0) return 0;
    // Keep the chase staffed.
    const have = cars.filter((c) => c.kind === 'police').length;
    state.policeTimer -= dt;
    if (have < policeTargetCount() && state.policeTimer <= 0) {
      spawnPolice();
      state.policeTimer = 1.2;
    }
    // No cop close for a while: the heat cools, one star at a time.
    const nearest = cars.reduce((m, c) => (c.kind === 'police' ? Math.min(m, dist(c.x, c.y, player.x, player.y)) : m), Infinity);
    if (nearest > 460) {
      state.wantedTimer += dt;
      if (state.wantedTimer > WANTED.decayDelay + WANTED.decayInterval) {
        player.wanted -= 1;
        state.wantedTimer = WANTED.decayDelay;
        return EVENT_WANTED;
      }
    } else {
      state.wantedTimer = 0;
    }
    return 0;
  }

  /**
   * One fixed step. `input` is {x, y, enter, punch, shoot}. With `harmless`
   * set (the title screen's backdrop) the city lives but nothing can hurt
   * the player, raise the heat or advance a mission.
   */
  function step(dt, input, harmless) {
    if (state.over) return EVENT_OVER;
    state.time += dt;
    let events = 0;
    events |= stepPlayer(dt, input, harmless);
    events |= stepCars(dt, harmless);
    events |= stepPeds(dt, harmless);
    events |= stepBullets(dt, harmless);
    events |= stepPickups(dt);
    events |= stepWanted(dt, harmless);
    if (!harmless) events |= stepMission(dt);
    updateCamera();
    if (state.over) events |= EVENT_OVER;
    return events;
  }

  reset();
  return { state, reset, step, raiseWanted };
}
