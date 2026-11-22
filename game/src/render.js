// Everything the eye sees: the city from above, the cars and people in it,
// the HUD with its minimap and wanted stars, and the title, pause and
// wasted/busted screens. All art is drawn with canvas paths — no images.
import { BEACH_Y, DAY_LENGTH, FONT, PALETTE, ROAD_WIDTH, ROADS_H, ROADS_V, SIDEWALK, WORLD } from './config.js';
import { currentObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';

const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Daylight: 0 = noon, 1 = midnight. Returns the night overlay to paint. */
function nightOverlay(time) {
  const frac = (time % DAY_LENGTH) / DAY_LENGTH;
  // Day 0–0.45, dusk 0.45–0.55, night 0.55–0.92, dawn 0.92–1.
  let alpha = 0;
  let color = '8, 14, 44';
  if (frac < 0.45) alpha = 0;
  else if (frac < 0.55) { alpha = ((frac - 0.45) / 0.1) * 0.16; color = '120, 60, 20'; }
  else if (frac < 0.92) alpha = 0.16 + ((frac - 0.55) / 0.37) * 0.2;
  else { alpha = 0.36 - ((frac - 0.92) / 0.08) * 0.36; color = '120, 60, 20'; }
  return { alpha, color };
}

function isNight(time) {
  const frac = (time % DAY_LENGTH) / DAY_LENGTH;
  return frac > 0.55 && frac < 0.92;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function cameraFor(G, screen) {
    const scale = Math.max(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const viewW = canvas.width / scale;
    const viewH = canvas.height / scale;
    let cx;
    let cy;
    if (screen === SCREEN_TITLE) {
      const t = G.time * 0.05;
      cx = 1700 + Math.sin(t) * 500 - viewW / 2;
      cy = 1100 + Math.cos(t * 0.7) * 260 - viewH / 2;
    } else {
      cx = G.player.x - viewW / 2;
      cy = G.player.y - viewH / 2;
    }
    cx = Math.max(0, Math.min(WORLD.width - viewW, cx));
    cy = Math.max(0, Math.min(WORLD.height - viewH, cy));
    if (WORLD.width < viewW) cx = (WORLD.width - viewW) / 2;
    if (WORLD.height < viewH) cy = (WORLD.height - viewH) / 2;
    return { x: cx, y: cy, scale, viewW, viewH };
  }

  function drawGround(G, cam) {
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(cam.x, cam.y, cam.viewW, cam.viewH);
    // Beach and water along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(cam.x, Math.max(cam.y, BEACH_Y), cam.viewW, WORLD.height - Math.max(cam.y, BEACH_Y));
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(cam.x, Math.max(cam.y, 2560), cam.viewW, WORLD.height - Math.max(cam.y, 2560));
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 260) {
      ctx.fillRect(x + ((G.time * 12) % 260), 2586, 130, 6);
    }
    // Park.
    const park = G.world.park;
    if (park) {
      ctx.fillStyle = PALETTE.parkGrass;
      ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
    }
    for (const prop of G.world.props) {
      if (prop.kind === 'pond') {
        ctx.fillStyle = PALETTE.water;
        ctx.beginPath();
        ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w / 2, prop.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (prop.kind === 'container') {
        ctx.fillStyle = prop.color;
        ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(prop.x, prop.y + prop.h - 8, prop.w, 8);
      }
    }
    // Sidewalks, then roads, then dashes.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const cx of ROADS_V) ctx.fillRect(cx - ROAD_WIDTH / 2 - SIDEWALK, cam.y, ROAD_WIDTH + SIDEWALK * 2, cam.viewH);
    for (const cy of ROADS_H) ctx.fillRect(cam.x, cy - ROAD_WIDTH / 2 - SIDEWALK, cam.viewW, ROAD_WIDTH + SIDEWALK * 2);
    ctx.fillStyle = PALETTE.road;
    for (const cx of ROADS_V) ctx.fillRect(cx - ROAD_WIDTH / 2, cam.y, ROAD_WIDTH, cam.viewH);
    for (const cy of ROADS_H) ctx.fillRect(cam.x, cy - ROAD_WIDTH / 2, cam.viewW, ROAD_WIDTH);
    ctx.fillStyle = PALETTE.roadLine;
    for (const cx of ROADS_V) {
      for (let y = Math.floor(cam.y / 48) * 48; y < cam.y + cam.viewH; y += 48) {
        ctx.fillRect(cx - 2, y, 4, 24);
      }
    }
    for (const cy of ROADS_H) {
      for (let x = Math.floor(cam.x / 48) * 48; x < cam.x + cam.viewW; x += 48) {
        ctx.fillRect(x, cy - 2, 24, 4);
      }
    }
  }

  function drawBuildings(G, cam) {
    for (const b of G.world.buildings) {
      if (b.x > cam.x + cam.viewW || b.x + b.w < cam.x || b.y > cam.y + cam.viewH || b.y + b.h < cam.y) continue;
      // Fake height: a wall face offset down-left, then the roof.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x - 6, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x - 5, b.y + 5, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Roof details: a few skylights / vents.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillRect(b.x + 12 + i * 46, b.y + 12 + j * 46, 18, 12);
        }
      }
      if (b.name) {
        ctx.fillStyle = '#fff8e6';
        ctx.font = `bold 15px ${FONT}`;
        ctx.textAlign = 'center';
        const label = { bank: 'FIRST BAY BANK', garage: "MILO'S GARAGE", station: 'BAY PD', hospital: 'ST. MARISOL', chopshop: 'CHOP SHOP', marina: 'MARINA' }[b.name] ?? b.name.toUpperCase();
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
  }

  function drawTrees(G, cam) {
    for (const t of G.world.trees) {
      if (t.x < cam.x - 40 || t.x > cam.x + cam.viewW + 40 || t.y < cam.y - 40 || t.y > cam.y + cam.viewH + 40) continue;
      ctx.strokeStyle = '#7a5a38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + 4, t.y - 14);
      ctx.stroke();
      ctx.fillStyle = '#3f8f4f';
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y - 20, 13, 0, Math.PI * 2);
      ctx.arc(t.x - 8, t.y - 12, 9, 0, Math.PI * 2);
      ctx.arc(t.x + 14, t.y - 12, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(G, car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    roundRect(ctx, -30, -12, 62, 32, 8);
    ctx.fill();
    const body = car.dead ? '#3a3d42' : car.color;
    ctx.fillStyle = body;
    roundRect(ctx, -32, -15, 64, 30, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, -8, -12, 20, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    roundRect(ctx, 12, -11, 12, 22, 3);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-24, -17, 12, 5);
    ctx.fillRect(-24, 12, 12, 5);
    ctx.fillRect(12, -17, 12, 5);
    ctx.fillRect(12, 12, 12, 5);
    if (car.type === 'police' && !car.dead) {
      const flash = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-4, -15, 8, 5);
      ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      ctx.fillRect(-4, 10, 8, 5);
    }
    if (car.brakeLight) {
      ctx.fillStyle = '#ff2e2e';
      ctx.fillRect(-33, -12, 3, 6);
      ctx.fillRect(-33, 6, 3, 6);
    }
    ctx.restore();
    if (isNight(G.time) && !car.dead && car.driver !== 'parked') {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const grad = ctx.createRadialGradient(34, 0, 4, 34, 0, 130);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.20)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(34, -12);
      ctx.lineTo(150, -52);
      ctx.lineTo(150, 52);
      ctx.lineTo(34, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPerson(x, y, angle, shirt, down, isCop) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(14, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(7, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (isCop) {
      ctx.fillStyle = '#1c2f4a';
      ctx.fillRect(-2, -6, 10, 12);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(2, -6, 3, 12);
    }
    ctx.restore();
  }

  function drawObjectiveMarker(G) {
    const obj = currentObjective(G);
    if (!obj || obj.x === G.player.x) return;
    const pulse = 1 + Math.sin(G.time * 5) * 0.15;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.fillStyle = 'rgba(255, 207, 63, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(10, -14);
    ctx.lineTo(-10, -14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWorldObjects(G, cam) {
    for (const s of G.skid) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, s.life * 0.25);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = '#1c1e22';
      ctx.fillRect(-16, -13, 32, 4);
      ctx.fillRect(-16, 9, 32, 4);
      ctx.restore();
    }
    for (const pk of G.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(pk.bob) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 12 - bob, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#3f7d3a';
        roundRect(ctx, -11, -9, 22, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#ffcf3f';
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 4);
      } else {
        ctx.fillStyle = '#8a6d2f';
        ctx.fillRect(-11, -8, 22, 16);
        ctx.fillStyle = '#ffcf3f';
        ctx.fillRect(-6, -4, 12, 8);
      }
      ctx.restore();
    }
    for (const car of G.cars) drawCar(G, car, G.time);
    for (const ped of G.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.state === 'down', false);
    for (const cop of G.cops) drawPerson(cop.x, cop.y, cop.angle, '#2f6fb2', cop.state === 'down', true);
    const p = G.player;
    if (!p.inCar) drawPerson(p.x, p.y, p.angle, '#f2f2f2', false, false);
    // Player marker ring so the eye finds the hero in a crowd.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    drawObjectiveMarker(G);
    for (const pt of G.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap(G) {
    const mw = 216;
    const mh = 168;
    const mx = 16;
    const my = canvas.height - mh - 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#4d7a45';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my + BEACH_Y * sy, mw, mh - BEACH_Y * sy);
    ctx.fillStyle = '#6d6f75';
    for (const cx of ROADS_V) ctx.fillRect(mx + cx * sx - 2, my, 4, mh);
    for (const cy of ROADS_H) ctx.fillRect(mx, my + cy * sy, mw, 4);
    ctx.fillStyle = '#2c2f36';
    for (const b of G.world.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    const obj = currentObjective(G);
    if (obj) {
      const pulse = 4 + Math.sin(G.time * 5) * 1.5;
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath();
      ctx.arc(mx + obj.x * sx, my + obj.y * sy, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c9c9c9';
    for (const car of G.cars) {
      if (car.dead || car.driver === 'parked') continue;
      ctx.fillRect(mx + car.x * sx - 1, my + car.y * sy - 1, 3, 3);
    }
    ctx.fillStyle = '#4f8ff0';
    for (const cop of G.cops) {
      if (cop.state === 'down') continue;
      ctx.beginPath();
      ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of G.cars) {
      if (car.driver !== 'police' || car.dead) continue;
      ctx.fillStyle = Math.floor(G.time * 4) % 2 === 0 ? '#ff3b30' : '#2f7bff';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx + G.player.x * sx, my + G.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(10, 12, 24, 0.7)';
    roundRect(ctx, mx - 6, my - 28, 110, 20, 5);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('PALMERA BAY', mx, my - 14);
  }

  function drawHUD(G, ui) {
    const p = G.player;
    // Objective card, top-left.
    const obj = currentObjective(G);
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 16, 16, 380, 64, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'left';
    const mission = G.mission.active ? G.missions[G.mission.index] : null;
    ctx.fillText(mission ? `${mission.title.toUpperCase()}  —  ${mission.contact.toUpperCase()}` : 'FREE ROAM', 30, 38);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(obj ? obj.text : (G.mission.allDone ? 'Story complete — enjoy the Bay!' : 'Press M for a new job — just kidding, jobs call you.'), 30, 60);
    // Wanted stars, cash, health, ammo — top-right.
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, canvas.width - 316, 16, 300, 96, 10);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.font = '22px sans-serif';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < G.wanted ? '#ffcf3f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', canvas.width - 36 - i * 26, 46);
    }
    ctx.fillStyle = '#7dff8a';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`$${G.cash.toLocaleString('en-US')}`, canvas.width - 36, 74);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(p.inCar ? 'DRIVING' : `AMMO ${p.ammo}`, canvas.width - 280, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, canvas.width - 280, 86, 244, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.hp > 30 ? PALETTE.health : PALETTE.danger;
    roundRect(ctx, canvas.width - 280, 86, 244 * (p.hp / 100), 10, 5);
    ctx.fill();
    // Speed and context prompt, bottom-right.
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.12);
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, canvas.width - 216, canvas.height - 76, 200, 60, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${mph}`, canvas.width - 56, canvas.height - 34);
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('MPH', canvas.width - 30, canvas.height - 34);
    }
    if (G.hint) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(G.hint, canvas.width / 2, canvas.height - 110);
    } else if (!p.inCar) {
      const near = G.cars.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 78);
      if (near) {
        ctx.fillStyle = PALETTE.panel;
        roundRect(ctx, canvas.width / 2 - 110, canvas.height - 150, 220, 34, 8);
        ctx.fill();
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('Press E to steal the car', canvas.width / 2, canvas.height - 128);
      }
    }
    // Compass arrow to an off-screen objective.
    if (obj) {
      const dx = obj.x - p.x;
      const dy = obj.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 420) {
        const ang = Math.atan2(dy, dx);
        const ax = canvas.width / 2 + Math.cos(ang) * 190;
        const ay = canvas.height / 2 + Math.sin(ang) * 130;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffcf3f';
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(dist)}m`, ax, ay + 26);
      }
    }
    // Banner (mission start / complete / pickup).
    if (G.banner && G.banner.t > 0) {
      const alpha = Math.min(1, G.banner.t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE.panel;
      const w = Math.min(640, 40 + G.banner.text.length * 11);
      roundRect(ctx, canvas.width / 2 - w / 2, 96, w, G.banner.sub ? 66 : 44, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(G.banner.text, canvas.width / 2, 124);
      if (G.banner.sub) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `15px ${FONT}`;
        ctx.fillText(G.banner.sub, canvas.width / 2, 148);
      }
      ctx.restore();
    }
    // Robbery progress bar.
    const M = G.mission;
    if (M.active) {
      const step = G.missions[M.index].steps[M.step];
      if (step && step.kind === 'rob' && M.progress > 0) {
        ctx.fillStyle = PALETTE.panel;
        roundRect(ctx, canvas.width / 2 - 150, canvas.height - 200, 300, 22, 8);
        ctx.fill();
        ctx.fillStyle = PALETTE.accent;
        roundRect(ctx, canvas.width / 2 - 146, canvas.height - 196, 292 * (M.progress / step.seconds), 14, 6);
        ctx.fill();
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('EMPTYING THE VAULT…', canvas.width / 2, canvas.height - 208);
      }
      if (step && step.kind === 'survive') {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`STAY FREE — ${Math.ceil(M.timer)}s`, canvas.width / 2, 190);
      }
    }
    // Clock.
    const frac = (G.time % DAY_LENGTH) / DAY_LENGTH;
    const hours = Math.floor(((frac * 24) + 8) % 24);
    const mins = Math.floor((((frac * 24) + 8) % 1) * 60);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${isNight(G.time) ? '☾' : '☀'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}${ui.muted ? '   🔇 MUTED' : ''}`, 16, canvas.height - 196);
    drawMinimap(G);
  }

  function drawTitle(G, ui) {
    ctx.fillStyle = 'rgba(10, 12, 24, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf3f';
    ctx.font = `bold ${Math.min(84, canvas.width / 12)}px ${FONT}`;
    ctx.fillText('PALMERA BAY', canvas.width / 2, canvas.height / 2 - 96);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('A SUN-SOAKED CRIME STORY', canvas.width / 2, canvas.height / 2 - 58);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Steal cars. Outrun the Bay PD. Run five jobs and take the city.', canvas.width / 2, canvas.height / 2 - 24);
    const pulse = 0.7 + Math.sin(G.time * 4) * 0.3;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(ui.hasSave ? 'PRESS SPACE OR CLICK — CONTINUE' : 'PRESS SPACE OR CLICK — NEW GAME', canvas.width / 2, canvas.height / 2 + 34);
    ctx.restore();
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const lines = [
      'WASD / Arrows — walk & drive      SHIFT — run      E — steal / exit car',
      'F — punch      Mouse click — shoot      SPACE — handbrake      P — pause      M — mute',
      'Steal cars, dodge the law, follow the yellow marker. Your progress saves automatically.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + 78 + i * 24));
    if (ui.best > 0) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(`Best cash held: $${ui.best.toLocaleString('en-US')}`, canvas.width / 2, canvas.height / 2 + 168);
    }
  }

  function drawEnd(G, screen, ui) {
    ctx.fillStyle = 'rgba(10, 10, 14, 0.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = screen === SCREEN_WASTED ? PALETTE.danger : '#4f8ff0';
    ctx.font = `bold 72px ${FONT}`;
    ctx.fillText(screen === SCREEN_WASTED ? 'WASTED' : 'BUSTED', canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `18px ${FONT}`;
    ctx.fillText(
      screen === SCREEN_WASTED
        ? 'The Bay got the better of you — but the hospital patches everyone up.'
        : 'The Bay PD caught up with you. Milo bailed you out — for a fee.',
      canvas.width / 2, canvas.height / 2 + 22,
    );
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('PRESS SPACE OR CLICK TO GET BACK OUT THERE', canvas.width / 2, canvas.height / 2 + 72);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Cash: $${G.cash.toLocaleString('en-US')}   •   Jobs done: ${G.stats.missionsDone}   •   Cars stolen: ${G.stats.carsStolen}`, canvas.width / 2, canvas.height / 2 + 104);
  }

  function drawPaused(G) {
    ctx.fillStyle = 'rgba(10, 12, 24, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = `17px ${FONT}`;
    ctx.fillText('P or ESC to keep playing  •  M to mute  •  progress saves automatically', canvas.width / 2, canvas.height / 2 + 30);
  }

  return {
    draw(G, screen, ui) {
      const cam = cameraFor(G, screen);
      const shakeX = G.shake > 0 ? (Math.random() * 2 - 1) * G.shake : 0;
      const shakeY = G.shake > 0 ? (Math.random() * 2 - 1) * G.shake : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#10131c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(cam.scale, 0, 0, cam.scale, -cam.x * cam.scale + shakeX, -cam.y * cam.scale + shakeY);
      drawGround(G, cam);
      drawBuildings(G, cam);
      drawTrees(G, cam);
      drawWorldObjects(G, cam);
      // Night falls over the city.
      const night = nightOverlay(G.time);
      if (night.alpha > 0.01) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(${night.color}, ${night.alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(cam.scale, 0, 0, cam.scale, -cam.x * cam.scale + shakeX, -cam.y * cam.scale + shakeY);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(G, ui);
      if (screen === SCREEN_TITLE) drawTitle(G, ui);
      if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) drawEnd(G, screen, ui);
      if (screen === SCREEN_PAUSED) drawPaused(G);
    },
  };
}
