// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 logical viewport is scaled to fit the window; inside it a
// camera follows the player across the 3200x2400 city. Flat top-down shapes,
// canvas text for the HUD, panels and the minimap. No game rules here.
import { CAR, FONT, PALETTE, ROADS_X, ROADS_Y, ROAD_W, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 32, bottom: 66 };
const MAP = { w: 200, h: 150, x: VIEW.width - 216, y: 16 };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function drawGround() {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mown checker, subtle.
    context.fillStyle = PALETTE.grassAlt;
    for (let x = 0; x < WORLD.width; x += 400) {
      for (let y = 0; y < WORLD.height; y += 400) {
        if (((x + y) / 400) % 2 === 0) context.fillRect(x, y, 400, 400);
      }
    }
    // South beach and bay water.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, 2260, WORLD.width, 70);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, 2330, WORLD.width, 70);
    context.strokeStyle = '#ffffff44';
    context.lineWidth = 3;
    for (let x = 0; x < WORLD.width; x += 160) {
      context.beginPath();
      context.moveTo(x, 2352);
      context.quadraticCurveTo(x + 40, 2344, x + 80, 2352);
      context.stroke();
    }
    // Sidewalks, then asphalt.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_W / 2 - 18, 0, ROAD_W + 36, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_W / 2 - 18, WORLD.width, ROAD_W + 36);
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS_X) {
      for (let y = 0; y < WORLD.height; y += 64) context.fillRect(rx - 3, y, 6, 34);
    }
    for (const ry of ROADS_Y) {
      for (let x = 0; x < WORLD.width; x += 64) context.fillRect(x, ry - 3, 34, 6);
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.buildingRoof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = '#ffffff22';
      for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 26) {
        for (let wy = b.y + 16; wy < b.y + b.h - 16; wy += 26) {
          context.fillRect(wx, wy, 10, 10);
        }
      }
    }
    context.fillStyle = '#2a7a34';
    for (const t of state.trees) {
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3a9a44';
      context.beginPath();
      context.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2a7a34';
    }
  }

  function drawCarShape(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const w = CAR.width; const l = CAR.length;
    context.fillStyle = '#00000055';
    context.fillRect(-l / 2 + 3, -w / 2 + 3, l, w);
    context.fillStyle = car.color;
    rr(context, -l / 2, -w / 2, l, w, 9);
    context.fill();
    // Windshield + roof.
    context.fillStyle = '#1c2733';
    context.fillRect(-l / 2 + 8, -w / 2 + 4, 12, w - 8);
    context.fillRect(l / 2 - 20, -w / 2 + 4, 12, w - 8);
    context.fillStyle = '#ffffff2e';
    context.fillRect(-6, -w / 2 + 4, 16, w - 8);
    // Headlights.
    context.fillStyle = '#fff8c0';
    context.fillRect(l / 2 - 3, -w / 2 + 2, 3, 6);
    context.fillRect(l / 2 - 3, w / 2 - 8, 3, 6);
    if (car.kind === 'police') {
      const flash = Math.floor(time / 0.28) % 2 === 0;
      context.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
      context.fillRect(-4, -w / 2 - 1, 9, 6);
      context.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
      context.fillRect(-4, w / 2 - 5, 9, 6);
      context.fillStyle = '#f2f2f2';
      context.fillRect(-2, -w / 2 + 6, 4, w - 12);
    }
    if (car.kind === 'taxi') {
      context.fillStyle = '#111';
      for (let i = 0; i < 5; i += 1) context.fillRect(-l / 2 + 6 + i * 10, -3, 5, 6);
    }
    context.restore();
  }

  function drawWorld(state, screen) {
    const cam = state.camera;
    context.save();
    context.translate(-cam.x, -cam.y);
    drawGround();
    drawBuildings(state);
    // Pickups.
    for (const p of state.pickups) {
      const bob = Math.sin(p.bob) * 3;
      context.save();
      context.translate(p.x, p.y + bob);
      if (p.kind === 'ammo') {
        context.fillStyle = PALETTE.pickupAmmo;
        rr(context, -11, -11, 22, 22, 4); context.fill();
        context.fillStyle = '#0b0e14';
        context.fillRect(-6, -7, 3, 14);
        context.fillRect(0, -7, 3, 14);
        context.fillRect(6, -7, 3, 14);
      } else if (p.kind === 'health') {
        context.fillStyle = PALETTE.pickupHealth;
        rr(context, -11, -11, 22, 22, 4); context.fill();
        context.fillStyle = '#fff';
        context.fillRect(-3, -8, 6, 16);
        context.fillRect(-8, -3, 16, 6);
      } else {
        context.fillStyle = PALETTE.pickupCash;
        context.beginPath(); context.arc(0, 0, 11, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#0b4d00';
        text('$', 0, 5, 16, '#0b4d00', 'center');
      }
      context.restore();
    }
    // Mission marker: pulsing diamond + light pillar.
    const mi = state.mission;
    if (mi.target && mi.index < 3 && screen !== SCREEN_TITLE) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      context.fillStyle = '#ffe14d33';
      context.fillRect(mi.target.x - 16, mi.target.y - 260, 32, 260);
      context.save();
      context.translate(mi.target.x, mi.target.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.marker;
      const s = 16 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.restore();
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(mi.target.x, mi.target.y, 30 * pulse, 0, Math.PI * 2);
      context.stroke();
    }
    // Pedestrians.
    for (const ped of state.peds) {
      context.save();
      context.translate(ped.x, ped.y);
      if (ped.down > 0) {
        context.rotate(ped.angle + Math.PI / 2);
        context.fillStyle = ped.color;
        context.fillRect(-14, -6, 28, 12);
        context.fillStyle = '#f2c9a0';
        context.beginPath(); context.arc(16, 0, 6, 0, Math.PI * 2); context.fill();
      } else {
        context.fillStyle = ped.color;
        context.beginPath(); context.arc(0, 0, 11, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#f2c9a0';
        context.beginPath(); context.arc(0, 0, 6, 0, Math.PI * 2); context.fill();
        context.strokeStyle = '#00000088';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(Math.cos(ped.angle) * 15, Math.sin(ped.angle) * 15);
        context.stroke();
      }
      context.restore();
    }
    // Cars (player's car included, drawn with a gold outline).
    for (const car of state.cars) {
      if (car.kind === 'player') {
        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.angle);
        context.strokeStyle = PALETTE.player;
        context.lineWidth = 4;
        rr(context, -CAR.length / 2 - 4, -CAR.width / 2 - 4, CAR.length + 8, CAR.width + 8, 11);
        context.stroke();
        context.restore();
      }
      drawCarShape(car, state.time);
    }
    // Bullets.
    context.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Player on foot.
    const p = state.player;
    if (!p.inCar) {
      context.save();
      context.translate(p.x, p.y);
      if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) context.globalAlpha = 0.35;
      context.fillStyle = PALETTE.player;
      context.beginPath(); context.arc(0, 0, 13, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#7a5b00';
      context.lineWidth = 3;
      context.beginPath(); context.arc(0, 0, 13, 0, Math.PI * 2); context.stroke();
      context.fillStyle = '#222';
      context.beginPath(); context.arc(0, 0, 6, 0, Math.PI * 2); context.fill();
      // Facing + gun barrel.
      context.strokeStyle = '#222';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(Math.cos(p.angle) * 22, Math.sin(p.angle) * 22);
      context.stroke();
      context.restore();
    }
    context.restore();
  }

  function drawMinimap(state) {
    const sx = MAP.w / WORLD.width;
    const sy = MAP.h / WORLD.height;
    context.fillStyle = '#0b0e14cc';
    context.fillRect(MAP.x - 4, MAP.y - 4, MAP.w + 8, MAP.h + 8);
    context.fillStyle = '#2e6b34';
    context.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    context.strokeStyle = '#23262e';
    context.lineWidth = 3;
    for (const rx of ROADS_X) {
      context.beginPath(); context.moveTo(MAP.x + rx * sx, MAP.y); context.lineTo(MAP.x + rx * sx, MAP.y + MAP.h); context.stroke();
    }
    for (const ry of ROADS_Y) {
      context.beginPath(); context.moveTo(MAP.x, MAP.y + ry * sy); context.lineTo(MAP.x + MAP.w, MAP.y + ry * sy); context.stroke();
    }
    const mi = state.mission;
    if (mi.target && mi.index < 3) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(MAP.x + mi.target.x * sx, MAP.y + mi.target.y * sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = '#ff2a2a';
        context.beginPath();
        context.arc(MAP.x + car.x * sx, MAP.y + car.y * sy, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Viewport rectangle.
    context.strokeStyle = '#ffffff88';
    context.lineWidth = 1;
    context.strokeRect(
      MAP.x + state.camera.x * sx, MAP.y + state.camera.y * sy,
      VIEW.width * sx, VIEW.height * sy,
    );
    // Player dot on top.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(MAP.x + state.player.x * sx, MAP.y + state.player.y * sy, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#000';
    context.lineWidth = 1;
    context.stroke();
    text('VICE BAY', MAP.x + MAP.w / 2, MAP.y + MAP.h + 16, 12, PALETTE.muted, 'center');
  }

  function drawHud(state, save) {
    const p = state.player;
    context.fillStyle = PALETTE.hudBg;
    rr(context, 12, 12, 250, 132, 10); context.fill();
    text(`$${p.money}`, 26, 44, 30, PALETTE.good, 'left');
    // Health bar.
    context.fillStyle = '#333';
    context.fillRect(26, 56, 180, 14);
    context.fillStyle = p.hp > 50 ? '#37d67a' : p.hp > 25 ? '#ffb02e' : PALETTE.danger;
    context.fillRect(26, 56, 180 * (p.hp / 100), 14);
    text(`HP ${Math.ceil(p.hp)}`, 212, 70, 15, PALETTE.text, 'left');
    text(`AMMO ${p.ammo}`, 26, 100, 20, p.ammo === 0 ? PALETTE.danger : PALETTE.text, 'left');
    text(p.inCar ? 'DRIVING — W/S gas+brake, A/D steer' : 'ON FOOT — E near a car to drive', 26, 124, 14, PALETTE.muted, 'left');
    // Wanted stars, top centre-right, under the minimap line.
    const stars = '★'.repeat(p.wanted) + '☆'.repeat(3 - p.wanted);
    text(stars, MAP.x + MAP.w / 2, MAP.y + MAP.h + 44, 30, PALETTE.star, 'center');
    text(p.wanted > 0 ? 'WANTED' : 'CLEAN', MAP.x + MAP.w / 2, MAP.y + MAP.h + 66, 13, p.wanted > 0 ? PALETTE.danger : PALETTE.muted, 'center');
    drawMinimap(state);
    // Mission objective, top centre.
    const mi = state.mission;
    let objective = 'Free roam — all jobs done!';
    if (mi.index < 3) {
      const names = ['Taxi Fare', 'Hot Parcel', 'Heat Escape'];
      const stageText = mi.stage === 'pickup'
        ? (mi.index === 2 ? 'Reach the safehouse' : 'Go to the yellow marker')
        : (mi.index === 1 ? 'Deliver the parcel!' : 'Drive to the drop-off');
      objective = `Job ${mi.index + 1}/3: ${names[mi.index]} — ${stageText}`;
      if (mi.stage === 'dropoff' && mi.timer > 0) objective += `  ⏱ ${Math.ceil(mi.timer)}s`;
    }
    text(objective, VIEW.width / 2, 30, 19, PALETTE.text, 'center');
    // Banner.
    if (mi.bannerTimer > 0 && mi.banner) {
      context.fillStyle = '#141821dd';
      const bw = Math.min(860, context.measureText(mi.banner).width + 40);
      rr(context, (VIEW.width - bw) / 2, 48, bw, 36, 8); context.fill();
      text(mi.banner, VIEW.width / 2, 73, 17, PALETTE.marker, 'center');
    }
    // Controls reminder, bottom left.
    text('WASD move/drive · E enter car · J punch · K shoot · M mute · P pause', 16, VIEW.height - 14, 14, PALETTE.muted, 'left');
    if (save && save.muted) text('MUTED (M)', VIEW.width - 16, VIEW.height - 14, 14, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    rr(context, x, y, PANEL.width, height, 14); context.fill();
    context.strokeStyle = '#ffd23f55';
    context.lineWidth = 2;
    rr(context, x, y, PANEL.width, height, 14); context.stroke();
    text(title, VIEW.width / 2, y + 72, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 34, 22, PALETTE.marker, 'center');
  }

  function draw(state, screen, save) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWorld(state, screen);
    if (screen === SCREEN_TITLE) {
      const best = save ? save.bestMoney || 0 : 0;
      const jobs = save ? save.missionsDone || 0 : 0;
      drawPanel('VICE BAY', [
        'A 2D open-world crime game. Steal cars, dodge the law,',
        'run three jobs: taxi fare, hot parcel, heat escape.',
        'WASD / arrows — move & drive · E — enter / exit car',
        'J — punch · K — shoot · M — mute · P — pause',
        `Best banked: $${best} · Jobs finished: ${jobs}/3`,
      ], 'Press Space or click to start');
      return;
    }
    drawHud(state, save);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const p = state.player;
      drawPanel(p.hp <= 0 ? 'WASTED' : 'BUSTED', [
        `You banked $${p.money} this run.`,
        `Best banked: $${save ? save.bestMoney || 0 : 0} · Jobs finished: ${save ? save.missionsDone || 0 : 0}/3`,
        'The bay will still be here tomorrow.',
      ], 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
