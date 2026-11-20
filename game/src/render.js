// Vice Bay — everything the player sees.
// One canvas, drawn in layers: ground and roads, buildings and parks,
// the mission marker, every car and pedestrian, then the HUD and the menus.

import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, ROAD_W, OCEAN_EDGE, SAND_EDGE, PALETTE } from './config.js';
import { isWater } from './world.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-24, -10, 48, 24);
  // Wheels.
  ctx.fillStyle = '#16181c';
  ctx.fillRect(-18, -13, 10, 5);
  ctx.fillRect(-18, 8, 10, 5);
  ctx.fillRect(10, -13, 10, 5);
  ctx.fillRect(10, 8, 10, 5);
  // Body.
  ctx.fillStyle = car.police ? '#e8e8e8' : car.color;
  roundRect(ctx, -24, -11, 48, 22, 6);
  ctx.fill();
  if (car.police) {
    ctx.fillStyle = '#22252c';
    ctx.fillRect(-6, -11, 14, 22);
  }
  // Windshield and roof.
  ctx.fillStyle = 'rgba(30,40,60,0.85)';
  ctx.fillRect(8, -8, 7, 16);
  ctx.fillStyle = car.police ? '#c9ced6' : 'rgba(255,255,255,0.25)';
  ctx.fillRect(-8, -8, 12, 16);
  if (car.taxi) {
    ctx.fillStyle = '#22252c';
    ctx.fillRect(-2, -11, 4, 22);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-4, -4, 8, 8);
  }
  if (car.police) {
    const flash = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-4, -11, 5, 4);
    ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
    ctx.fillRect(-4, 7, 5, 4);
  }
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(22, -9, 3, 4);
  ctx.fillRect(22, 5, 3, 4);
  ctx.restore();
}

function drawPersonShape(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(5, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWorld(ctx, city, cam, time) {
  const x0 = cam.x - 40;
  const y0 = cam.y - 40;
  const x1 = cam.x + VIEW_W + 40;
  const y1 = cam.y + VIEW_H + 40;
  // Grass base.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Mowing stripes for a little texture.
  ctx.fillStyle = PALETTE.grassDark;
  for (let y = 0; y < WORLD_H; y += 160) {
    if (y + 80 < y0 || y > y1) continue;
    ctx.fillRect(x0, y, x1 - x0, 80);
  }
  // Ocean and beach on the west edge.
  ctx.fillStyle = PALETTE.ocean;
  ctx.fillRect(x0, y0, Math.min(OCEAN_EDGE, x1) - x0 > 0 ? Math.min(OCEAN_EDGE, x1) - x0 : 0, y1 - y0);
  ctx.fillStyle = PALETTE.oceanDeep;
  for (let y = 120; y < WORLD_H; y += 320) {
    ctx.fillRect(0, y, OCEAN_EDGE, 8);
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(OCEAN_EDGE, y0, SAND_EDGE - OCEAN_EDGE, y1 - y0);
  // Sidewalks: pale bands along every road.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of city.vertical) ctx.fillRect(rx - ROAD_W / 2 - 12, y0, ROAD_W + 24, y1 - y0);
  for (const ry of city.horizontal) ctx.fillRect(x0, ry - ROAD_W / 2 - 12, x1 - x0, ROAD_W + 24);
  // Asphalt.
  ctx.fillStyle = PALETTE.road;
  for (const rx of city.vertical) ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
  for (const ry of city.horizontal) ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
  // Centre dashes.
  ctx.fillStyle = PALETTE.laneDash;
  for (const rx of city.vertical) {
    for (let y = 200; y < WORLD_H; y += 64) {
      if (y < y0 || y > y1) continue;
      ctx.fillRect(rx - 2, y, 4, 30);
    }
  }
  for (const ry of city.horizontal) {
    for (let x = 200; x < WORLD_W; x += 64) {
      if (x < x0 || x > x1) continue;
      ctx.fillRect(x, ry - 2, 30, 4);
    }
  }
  // Parks and plazas.
  for (const p of city.parks) {
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  for (const p of city.plazas) {
    ctx.fillStyle = PALETTE.plaza;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = PALETTE.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.treeLight;
    ctx.beginPath();
    ctx.arc(t.x - 4, t.y - 4, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // Buildings: wall shadow, roof, window grid.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillRect(b.x + 8 + c * 26, b.y + 8 + r * 26, 12, 9);
      }
    }
  }
  // Landmark labels.
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const labels = [
    [city.safehouse, 'SAFEHOUSE'],
    [city.taxiStand, 'CORAL AVE'],
    [city.depot, 'DEPOT'],
    [city.marina, 'MARINA'],
  ];
  for (const [spot, text] of labels) {
    ctx.fillStyle = 'rgba(10,14,24,0.6)';
    const w = ctx.measureText(text).width + 12;
    ctx.fillRect(spot.x - w / 2, spot.y - 34, w, 18);
    ctx.fillStyle = '#f5f2e8';
    ctx.fillText(text, spot.x, spot.y - 21);
  }
  // Safehouse roof marker.
  ctx.fillStyle = '#2f7a33';
  ctx.fillRect(city.safehouse.x - 26, city.safehouse.y - 18, 52, 36);
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(city.safehouse.x - 30, city.safehouse.y - 18);
  ctx.lineTo(city.safehouse.x, city.safehouse.y - 34);
  ctx.lineTo(city.safehouse.x + 30, city.safehouse.y - 18);
  ctx.closePath();
  ctx.fill();
}

function drawMarker(ctx, target, cam, time) {
  if (!target) return;
  const pulse = 1 + Math.sin(time * 5) * 0.12;
  const sx = target.x - cam.x;
  const sy = target.y - cam.y;
  if (sx > -60 && sx < VIEW_W + 60 && sy > -60 && sy < VIEW_H + 60) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,217,74,0.25)';
    ctx.beginPath();
    ctx.arc(sx, sy, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Beam.
    ctx.fillStyle = 'rgba(255,217,74,0.35)';
    ctx.fillRect(sx - 3, sy - 90, 6, 90);
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111';
    const w = ctx.measureText(target.label).width + 12;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(sx - w / 2, sy - 116, w, 20);
    ctx.fillStyle = '#111';
    ctx.fillText(target.label, sx, sy - 102);
  } else {
    // Edge arrow pointing at an off-screen objective.
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(ang) * (VIEW_W / 2 - 46);
    const ey = cy + Math.sin(ang) * (VIEW_H / 2 - 46);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(target.label, ex, ey - 20);
  }
}

function drawMinimap(ctx, state, city) {
  const mw = 232;
  const mh = 174;
  const mx = VIEW_W - mw - 14;
  const my = 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = PALETTE.hudBg;
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#6f9e4e';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = PALETTE.ocean;
  ctx.fillRect(mx, my, OCEAN_EDGE * sx, mh);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(mx + OCEAN_EDGE * sx, my, (SAND_EDGE - OCEAN_EDGE) * sx, mh);
  ctx.fillStyle = '#55585f';
  for (const rx of city.vertical) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
  for (const ry of city.horizontal) ctx.fillRect(mx, my + ry * sy - 2, mw, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const b of city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  if (state.mission && state.mission.target) {
    const blink = Math.floor(state.time * 3) % 2 === 0;
    ctx.fillStyle = blink ? PALETTE.gold : '#ff8c1a';
    ctx.beginPath();
    ctx.arc(mx + state.mission.target.x * sx, my + state.mission.target.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of state.cops) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of state.traffic) {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
  }
  // Player arrow.
  const px = mx + state.player.x * sx;
  const py = my + state.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f5f2e8';
  ctx.fillText('VICE BAY', mx, my + mh + 20);
}

function drawHud(ctx, state, city) {
  // Top-left money and health.
  ctx.fillStyle = PALETTE.hudBg;
  roundRect(ctx, 14, 14, 250, 64, 10);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('$' + Math.floor(state.player.money).toLocaleString('en-US'), 28, 44);
  ctx.fillStyle = '#f5f2e8';
  ctx.font = '12px sans-serif';
  ctx.fillText('BEST $' + Math.floor(state.best.money).toLocaleString('en-US'), 28, 64);
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(150, 30, 100, 12);
  ctx.fillStyle = state.player.hp > 30 ? '#58d858' : '#ff4a4a';
  ctx.fillRect(150, 30, 100 * Math.max(0, state.player.hp) / 100, 12);
  ctx.fillStyle = '#f5f2e8';
  ctx.font = '11px sans-serif';
  ctx.fillText('HP', 150, 26);
  // Wanted stars, top centre.
  const stars = state.wanted;
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? PALETTE.gold : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', VIEW_W / 2 - 70 + i * 35, 46);
  }
  if (state.wanted > 0) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffb3b3';
    ctx.fillText(state.wanted >= 3 ? 'POLICE PURSUIT' : 'WANTED', VIEW_W / 2, 66);
  }
  // Mission panel.
  if (state.mission) {
    const m = state.mission;
    ctx.fillStyle = PALETTE.hudBg;
    roundRect(ctx, 14, 88, 330, m.timer != null ? 76 : 58, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((state.missionIndex + 1) + '/3  ' + m.name, 26, 110);
    ctx.fillStyle = '#f5f2e8';
    ctx.font = '12px sans-serif';
    ctx.fillText(m.briefing, 26, 130);
    if (m.timer != null) {
      ctx.fillStyle = m.timer < 15 ? '#ff6a5e' : '#f5f2e8';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('⏱ ' + Math.ceil(m.timer) + 's', 26, 154);
    }
  } else {
    ctx.fillStyle = PALETTE.hudBg;
    roundRect(ctx, 14, 88, 330, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#f5f2e8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Free roam — hail a taxi fare (E near a cab) or', 26, 106);
    ctx.fillText('take a car and enjoy Vice Bay.', 26, 124);
  }
  // Toast message.
  if (state.message && state.messageTimer > 0) {
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(state.message).width + 28;
    ctx.fillStyle = PALETTE.hudBg;
    roundRect(ctx, VIEW_W / 2 - w / 2, VIEW_H - 84, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(state.message, VIEW_W / 2, VIEW_H - 61);
  }
  // Controls hint.
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(245,242,232,0.85)';
  ctx.fillText('WASD move/drive   E enter car   J punch   K shoot   P pause   M mute', 14, VIEW_H - 14);
  if (state.muted) {
    ctx.fillStyle = '#ffb3b3';
    ctx.fillText('MUTED', VIEW_W - 70, VIEW_H - 14);
  }
  if (state.bustMeter > 0.05) {
    ctx.fillStyle = 'rgba(255,60,60,0.85)';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED IN ' + Math.ceil(1.2 - state.bustMeter) + '… DON\'T LET THEM GRAB YOU', VIEW_W / 2, 110);
  }
  drawMinimap(ctx, state, city);
}

function panel(ctx, title, lines, accent) {
  const w = 640;
  const h = 150 + lines.length * 26;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;
  ctx.fillStyle = 'rgba(8,10,18,0.82)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, VIEW_W / 2, y + 62);
  ctx.fillStyle = '#f5f2e8';
  ctx.font = '15px sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, y + 100 + i * 26));
}

export function drawGame(ctx, state, city) {
  const cam = state.camera;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, city, cam, state.time);
  // Parked cars.
  for (const car of city.parkedCars) {
    if (!car.taken) drawCarShape(ctx, car, state.time);
  }
  // Traffic and police.
  for (const car of state.traffic) drawCarShape(ctx, car, state.time);
  for (const cop of state.cops) drawCarShape(ctx, cop, state.time);
  // Pedestrians.
  for (const ped of state.peds) {
    if (ped.alive) drawPersonShape(ctx, ped, state.time);
  }
  // Player's car, or the player on foot.
  if (!state.player.onFoot && state.player.car) {
    drawCarShape(ctx, state.player.car, state.time);
  } else {
    drawPersonShape(ctx, { x: state.player.x, y: state.player.y, angle: state.player.angle, color: '#ff5a7a' }, state.time);
  }
  // Bullets.
  ctx.fillStyle = '#ffe14a';
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawMarker(ctx, state.mission ? state.mission.target : null, cam, state.time);
  ctx.restore();

  if (state.mode === 'play' || state.mode === 'pause') {
    drawHud(ctx, state, city);
  }
  if (state.mode === 'menu') {
    ctx.fillStyle = 'rgba(6,8,16,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(ctx, 'VICE BAY', [
      'A sun-soaked open-world crime game. Steal cars, dodge the law,',
      'run three jobs for the crew — and get rich doing it.',
      '',
      'WASD / arrows — move & drive      E — steal / leave car',
      'J — punch      K — shoot      P — pause      M — mute',
      '',
      'BEST $' + Math.floor(state.best.money).toLocaleString('en-US') +
        '    •    JOBS DONE ' + state.best.missions,
      '',
      'Press ENTER or click to start',
    ], PALETTE.gold);
  }
  if (state.mode === 'pause') {
    ctx.fillStyle = 'rgba(6,8,16,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(ctx, 'PAUSED', ['Take a breath, Vice Bay waits.', '', 'Press P or Esc to keep playing'], '#4a9dff');
  }
  if (state.mode === 'over') {
    ctx.fillStyle = 'rgba(20,4,6,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(ctx, state.overReason === 'busted' ? 'BUSTED' : 'WASTED', [
      'The Vice Bay crew will remember this one.',
      '',
      'Cash banked: $' + Math.floor(state.player.money).toLocaleString('en-US') +
        '    •    Jobs finished: ' + state.stats.missionsDone + ' / 3',
      'Best cash: $' + Math.floor(state.best.money).toLocaleString('en-US'),
      '',
      'Press ENTER to run it back',
    ], '#ff4a4a');
  }
  // Water vignette: tint the screen edge when the player is near the sea.
  if (isWater(state.player.x, state.player.y)) {
    ctx.fillStyle = 'rgba(47,127,184,0.25)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
