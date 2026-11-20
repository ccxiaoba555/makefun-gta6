// Vice Bay — the city itself: roads, blocks, buildings, parks and parked cars.
// This module only builds static geography and answers geometry questions
// (is this water? does this circle hit a wall?). Living things — traffic,
// pedestrians, police — are spawned and driven by main.js.

import {
  WORLD_W, WORLD_H, ROAD_GAP, ROAD_W, FIRST_ROAD,
  OCEAN_EDGE, SAND_EDGE, PALETTE, CAR_COLORS,
} from './config.js';
import { rngInt, rngRange, rngPick, rngChance } from './random.js';

export function roadCentres() {
  const vertical = [];
  const horizontal = [];
  for (let x = FIRST_ROAD; x < WORLD_W; x += ROAD_GAP) vertical.push(x);
  for (let y = FIRST_ROAD; y < WORLD_H; y += ROAD_GAP) horizontal.push(y);
  return { vertical, horizontal };
}

export function isWater(x, y) {
  return x < OCEAN_EDGE;
}

export function isOnRoad(x, y) {
  const { vertical, horizontal } = roadCentres();
  const half = ROAD_W / 2;
  for (const rx of vertical) if (Math.abs(x - rx) <= half) return true;
  for (const ry of horizontal) if (Math.abs(y - ry) <= half) return true;
  return false;
}

// Push a circle out of every building it overlaps; returns corrected {x, y}.
export function resolveBuildingCollision(x, y, radius, buildings) {
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 < 0.001) {
        y = b.y - radius;
      } else {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        y = cy + (dy / d) * radius;
      }
    }
  }
  return { x, y };
}

export function clampToWorld(x, y, margin) {
  return {
    x: Math.max(margin, Math.min(WORLD_W - margin, x)),
    y: Math.max(margin, Math.min(WORLD_H - margin, y)),
  };
}

export function buildCity(seed) {
  const rng = seed;
  const { vertical, horizontal } = roadCentres();
  const buildings = [];
  const parks = [];
  const trees = [];
  const plazas = [];

  // The safehouse sits off-road in its block, so keep that patch clear of
  // buildings — otherwise the player gets shoved out of the walls and can
  // never stand on the mission target.
  const clearX0 = 2700, clearY0 = 1900, clearX1 = 2860, clearY1 = 2060;

  // Every cell between four roads gets a use: mostly buildings, sometimes a
  // park or a paved plaza. The beach strip stays open.
  for (let i = 0; i < vertical.length - 1; i++) {
    for (let j = 0; j < horizontal.length - 1; j++) {
      const x0 = vertical[i] + ROAD_W / 2 + 14;
      const x1 = vertical[i + 1] - ROAD_W / 2 - 14;
      const y0 = horizontal[j] + ROAD_W / 2 + 14;
      const y1 = horizontal[j + 1] - ROAD_W / 2 - 14;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      const roll = rng();
      if (roll < 0.12) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const count = rngInt(rng, 4, 8);
        for (let t = 0; t < count; t++) {
          trees.push({
            x: rngRange(rng, x0 + 20, x1 - 20),
            y: rngRange(rng, y0 + 20, y1 - 20),
            r: rngRange(rng, 12, 20),
          });
        }
        continue;
      }
      if (roll < 0.2) {
        plazas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      const lots = rngInt(rng, 1, 3);
      for (let l = 0; l < lots; l++) {
        const bw = rngRange(rng, 70, Math.min(150, (x1 - x0) / lots - 8));
        const bh = rngRange(rng, 70, Math.min(150, y1 - y0 - 8));
        const bx = x0 + (l * (x1 - x0)) / lots + 4;
        const by = y0 + rngRange(rng, 4, Math.max(5, y1 - y0 - bh - 4));
        if (bx < clearX1 && bx + bw > clearX0 && by < clearY1 && by + bh > clearY0) continue;
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          roof: rngPick(rng, PALETTE.buildingRoof),
          floors: rngInt(rng, 1, 4),
        });
      }
    }
  }

  // Parked cars line the roads, ready to be borrowed.
  const parkedCars = [];
  const spots = 26;
  for (let s = 0; s < spots; s++) {
    const alongVertical = rngChance(rng, 0.5);
    const road = alongVertical
      ? rngPick(rng, vertical)
      : rngPick(rng, horizontal);
    const along = rngRange(rng, FIRST_ROAD + 120, (alongVertical ? WORLD_H : WORLD_W) - 220);
    const side = rngChance(rng, 0.5) ? 1 : -1;
    const x = alongVertical ? road + side * (ROAD_W / 2 - 16) : along;
    const y = alongVertical ? along : road + side * (ROAD_W / 2 - 16);
    if (x < SAND_EDGE + 30) continue;
    parkedCars.push({
      x, y,
      angle: alongVertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      color: rngPick(rng, CAR_COLORS),
      taken: false,
    });
  }

  // Fixed landmarks the missions point at.
  const safehouse = { x: 2780, y: 1980, label: 'SAFEHOUSE' };
  const taxiStand = { x: 600, y: 200, label: 'CORAL AVE FARE' };
  const depot = { x: 2600, y: 600, label: 'PARCEL DEPOT' };
  const marina = { x: 300, y: 2200, label: 'MARINA' };
  // Rico's garage: park on the road beside it and press G to tune the car.
  const garage = { x: 1400, y: 1180, label: 'GARAGE' };

  return {
    buildings, parks, trees, plazas, parkedCars,
    safehouse, taxiStand, depot, marina, garage,
    vertical, horizontal,
  };
}

// A random point on a road, for spawning traffic.
export function randomRoadPoint(rng, city) {
  if (rngChance(rng, 0.5)) {
    return { x: rngPick(rng, city.vertical), y: rngRange(rng, 240, WORLD_H - 240), vertical: true };
  }
  return { x: rngRange(rng, 240, WORLD_W - 240), y: rngPick(rng, city.horizontal), vertical: false };
}

// A random pavement point near a road, for pedestrians.
export function randomPavementPoint(rng, city) {
  const p = randomRoadPoint(rng, city);
  const off = (ROAD_W / 2 + 14) * (rngChance(rng, 0.5) ? 1 : -1);
  if (p.vertical) return { x: p.x + off, y: p.y };
  return { x: p.x, y: p.y + off };
}
