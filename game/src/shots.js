// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (hold the lane, brake for the car
// ahead), so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { DAY_LENGTH, STEP } from './config.js';
import { makeCar } from './entities.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;
const IDLE = { move: { x: 0, y: 0, run: false }, drive: { throttle: 0, steer: 0, brake: false }, actions: {}, aim: { x: null, y: null } };

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Drive along `wantAngle`, holding the lane and braking for traffic. */
function autopilotDrive(G, wantAngle = -Math.PI / 2) {
  const car = G.player.inCar;
  if (!car) return IDLE;
  const diff = normAngle(wantAngle - car.angle);
  const fx = Math.cos(wantAngle);
  const fy = Math.sin(wantAngle);
  let blocked = false;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const perp = Math.abs(dx * fy - dy * fx);
    if (along > 0 && along < 120 && perp < 44) blocked = true;
  }
  return {
    move: { x: 0, y: 0, run: false },
    drive: { throttle: blocked ? 0 : 1, steer: Math.max(-1, Math.min(1, diff * 1.6)), brake: blocked },
    actions: {},
    aim: { x: null, y: null },
  };
}

function putPlayerInCar(G, type, x, y, angle, color) {
  const car = makeCar(G, type, x, y, angle, 'player', color);
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  return car;
}

/** Clear traffic and parked cars out of a lane so the staged drive stays a drive. */
function clearLane(G, vertical, at, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  G.cars = G.cars.filter((c) => {
    if (c.driver !== 'traffic' && c.driver !== 'parked') return true;
    if (c.tag === 'comet') return true;
    const along = vertical ? c.y : c.x;
    const across = vertical ? c.x : c.y;
    if (Math.abs(across - at) > 90) return true;
    if (along < lo || along > hi) return true;
    return false;
  });
}

function spawnChasers(G, count, behind, angle) {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  for (let i = 0; i < count; i += 1) {
    const car = makeCar(G, 'police', G.player.x - fx * (behind + i * 80), G.player.y - fy * (behind + i * 80), angle, 'police');
    car.speed = 560; // fast enough to hold the player's tail
    G.cars.push(car);
  }
}

/**
 * Set the game to the named scene (start, drive, chase or mission; any other
 * name is start) and return the screen to draw over it.
 */
export function stageShot(name, G, stepGame) {
  if (name === 'drive' || name === 'chase') {
    G.time = 0.12 * DAY_LENGTH; // late morning sun
    const car = putPlayerInCar(G, 'sport', 1226, 2280, -Math.PI / 2, '#e8c832');
    clearLane(G, true, 1226, 2280, 600);
    startMission(G, 0); // a real first job, so the HUD shows its objective
    if (name === 'chase') {
      car.hp = 400;
      car.maxHp = 400; // the staged chase must survive its own rams
      G.wanted = 3;
      G.time = 0.5 * DAY_LENGTH; // dusk, sirens in the orange light
      spawnChasers(G, 2, 150, -Math.PI / 2); // close behind, so they stay in frame
    }
    const seconds = name === 'chase' ? 2.8 : 3.6;
    for (let t = 0; t < seconds; t += SAMPLE) stepGame(G, autopilotDrive(G, -Math.PI / 2), SAMPLE);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    G.time = 0.52 * DAY_LENGTH; // dusk over the bank job
    G.cash = 3340; // $1,840 held, plus the $1,500 vault take
    const comet = G.cars.find((c) => c.tag === 'comet');
    if (comet) {
      comet.x = 1600;
      comet.y = 1550;
      comet.angle = 0;
      comet.driver = 'player';
      G.player.inCar = comet;
      G.player.x = 1600;
      G.player.y = 1550;
    }
    clearLane(G, false, 1550, 1600, 3000);
    G.mission.index = 4;
    G.mission.step = 2;
    G.mission.active = true;
    G.wanted = 4;
    G.banner = { text: 'The vault is empty!', sub: '+$1,500 — now run!', t: 3.5 };
    spawnChasers(G, 2, 300, 0);
    for (let t = 0; t < 2.6; t += SAMPLE) stepGame(G, autopilotDrive(G, 0), SAMPLE);
    return { screen: SCREEN_PLAY };
  }
  // start: the title over a living city at golden hour.
  G.time = 0.47 * DAY_LENGTH;
  for (let t = 0; t < 5; t += SAMPLE) stepGame(G, IDLE, SAMPLE);
  return { screen: SCREEN_TITLE };
}
