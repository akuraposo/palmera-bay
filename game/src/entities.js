// Everyone who moves in Palmera Bay: the player on foot and behind the
// wheel, parked and traffic cars, pedestrians, and the police who answer the
// wanted level. This module owns movement, collisions, car theft, combat,
// the wanted stars, and the particles and skid marks the action leaves.
import {
  BEACH_Y, CAR, PARKED_COUNT, PED_COUNT, PLAYER, PICKUP_COUNT,
  PICKUP_VALUE_MAX, PICKUP_VALUE_MIN, ROADS_H, ROADS_V, TRAFFIC_COUNT, WANTED,
} from './config.js';
import { isRoad, nearestRoad } from './world.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function moveBlocked(world, x, y, r) {
  return world.blocked(x, y, r);
}

/** Slide a circle through the city: try x, then y, so walls are slid along. */
function slide(world, entity, dx, dy, r) {
  if (!moveBlocked(world, entity.x + dx, entity.y, r)) entity.x += dx;
  if (!moveBlocked(world, entity.x, entity.y + dy, r)) entity.y += dy;
}

export function createPlayer(world) {
  const garage = world.special.garage;
  return {
    x: garage.x, y: garage.y + 110, angle: Math.PI / 2,
    hp: PLAYER.health, ammo: PLAYER.pistolAmmo, inCar: null,
    punchCooldown: 0, shootCooldown: 0, hurtTimer: 0, regenTimer: 0,
    speed: 0, moving: false,
  };
}

export function spawnParkedCars(G) {
  const types = ['sedan', 'taxi', 'sport', 'van', 'truck'];
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    const spot = G.world.parkedSpot();
    const type = i === 3 ? 'sport' : G.rng.pick(types);
    G.cars.push(makeCar(G, type, spot.x, spot.y, spot.angle, 'parked'));
  }
  // The yellow Comet GT the marina mission steals, parked on the coast road.
  const marina = G.world.special.marina;
  G.cars.push(makeCar(G, 'sport', marina.x + 60, 2400, Math.PI / 2, 'parked', '#e8c832', 'comet'));
}

export function makeCar(G, type, x, y, angle, driver, colorOverride, tag) {
  const spec = CAR.types[type];
  return {
    id: G.cars.length + 1, type, tag: tag ?? null, x, y, angle,
    speed: 0, hp: spec.hp, maxHp: spec.hp, driver,
    color: colorOverride ?? spec.color,
    heading: angleToHeading(angle), targetSpeed: 0, dead: false,
    smoke: 0, turnCooldown: 0, stuckTimer: 0, brakeLight: false,
  };
}

function angleToHeading(angle) {
  const a = normAngle(angle);
  if (Math.abs(a) < Math.PI / 4) return 0; // east
  if (Math.abs(a - Math.PI / 2) < Math.PI / 4) return 1; // south
  if (Math.abs(a + Math.PI / 2) < Math.PI / 4) return 3; // north
  return 2; // west
}

function headingAngle(h) {
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2][h];
}

export function spawnTraffic(G) {
  const types = ['sedan', 'taxi', 'sedan', 'van', 'truck', 'sedan'];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const vertical = G.rng.chance(0.5);
    let x, y, heading;
    if (vertical) {
      const road = G.rng.pick(ROADS_V);
      heading = G.rng.chance(0.5) ? 1 : 3;
      x = road + (heading === 1 ? -26 : 26);
      y = G.rng.range(100, BEACH_Y - 80);
    } else {
      const road = G.rng.pick(ROADS_H);
      heading = G.rng.chance(0.5) ? 0 : 2;
      y = road + (heading === 0 ? -26 : 26);
      x = G.rng.range(100, G.world.width - 100);
    }
    const car = makeCar(G, G.rng.pick(types), x, y, headingAngle(heading), 'traffic');
    car.heading = heading;
    car.targetSpeed = G.rng.range(130, 210);
    car.speed = car.targetSpeed;
    G.cars.push(car);
  }
}

export function spawnPeds(G) {
  const shirts = ['#e8e4d8', '#d95f4b', '#4b7dd9', '#e8b93c', '#7fb069', '#c77dbb', '#e07b39'];
  for (let i = 0; i < PED_COUNT; i += 1) {
    const p = G.world.sidewalkPoint();
    G.peds.push({
      x: p.x, y: p.y, angle: G.rng.range(0, Math.PI * 2),
      speed: G.rng.range(45, 75), hp: 100, state: 'walk',
      tx: p.x, ty: p.y, color: G.rng.pick(shirts), panic: 0, downTimer: 0,
    });
  }
}

export function spawnPickups(G) {
  for (let i = 0; i < PICKUP_COUNT; i += 1) {
    const p = G.world.sidewalkPoint();
    G.pickups.push({
      kind: i % 4 === 3 ? 'ammo' : 'cash', x: p.x, y: p.y,
      value: i % 4 === 3 ? 12 : G.rng.int(PICKUP_VALUE_MIN, PICKUP_VALUE_MAX),
      bob: G.rng.range(0, Math.PI * 2), taken: false,
    });
  }
}

export function addWanted(G, stars) {
  G.wanted = Math.min(WANTED.max, G.wanted + stars);
  G.quietTime = 0;
}

export function addParticles(G, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = G.rng.range(0, Math.PI * 2);
    const v = G.rng.range(speed * 0.3, speed);
    G.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: G.rng.range(life * 0.5, life), maxLife: life,
      size: G.rng.range(size * 0.6, size * 1.4), color,
    });
  }
}

export function explodeCar(G, car) {
  car.dead = true;
  car.speed = 0;
  addParticles(G, car.x, car.y, 26, '#ff9a3c', 260, 0.9, 7);
  addParticles(G, car.x, car.y, 18, '#3c3f46', 120, 1.6, 9);
  addParticles(G, car.x, car.y, 12, '#e5534b', 200, 0.6, 5);
  G.shake = Math.max(G.shake, 14);
  G.audio.explosion();
  if (car.driver === 'player') {
    G.player.inCar = null;
    G.player.hp -= 25;
    G.player.x = car.x + 50;
    G.player.y = car.y;
    G.player.hurtTimer = 1;
  }
  if (car.driver === 'police') addWanted(G, 1);
}

function damageCar(G, car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  car.smoke = Math.max(car.smoke, car.hp < car.maxHp * 0.5 ? 1 : 0.4);
  if (car.hp <= 0) explodeCar(G, car);
}

function carRadius() {
  return 34;
}

/** Push two cars apart and trade a little speed; hard hits damage both. */
function collideCars(G, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = carRadius() * 1.6;
  if (dist >= min || dist === 0) return;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  const aFixed = a.driver === 'parked' || a.dead;
  const bFixed = b.driver === 'parked' || b.dead;
  if (!aFixed) { a.x -= nx * push; a.y -= ny * push; }
  if (!bFixed) { b.x += nx * push; b.y += ny * push; }
  const impact = Math.abs(a.speed - b.speed);
  if (impact > 220) {
    damageCar(G, a, impact * 0.08);
    damageCar(G, b, impact * 0.08);
    addParticles(G, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffd76a', 180, 0.4, 4);
    if (a.driver === 'player' || b.driver === 'player') {
      G.audio.crash();
      G.shake = Math.max(G.shake, 6);
    }
    a.speed *= 0.55;
    b.speed *= 0.55;
  }
}

/** The nearest car to (x, y) within maxDist, or null. */
export function nearestCar(G, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar(G) {
  const p = G.player;
  const car = nearestCar(G, p.x, p.y, 78);
  if (!car) return;
  if (car.driver === 'police') addWanted(G, 2);
  else if (car.driver === 'parked' || car.driver === 'traffic') addWanted(G, 1);
  car.driver = 'player';
  car.targetSpeed = 0;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  G.stats.carsStolen += 1;
  G.audio.click();
  G.hint = car.tag === 'comet' ? 'The Comet GT — get it to the chop shop!' : '';
}

function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = null;
  const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
  p.x = car.x + side.x * 44;
  p.y = car.y + side.y * 44;
  if (G.world.blocked(p.x, p.y, PLAYER.radius)) {
    p.x = car.x - side.x * 44;
    p.y = car.y - side.y * 44;
  }
  G.audio.click();
}

export function punch(G) {
  const p = G.player;
  if (p.punchCooldown > 0 || p.inCar) return;
  p.punchCooldown = 0.35;
  G.audio.punch();
  const fx = p.x + Math.cos(p.angle) * 34;
  const fy = p.y + Math.sin(p.angle) * 34;
  let hit = false;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - fx, ped.y - fy) < 34) {
      ped.hp -= PLAYER.punchDamage;
      ped.state = ped.hp <= 0 ? 'down' : 'flee';
      ped.downTimer = ped.hp <= 0 ? 5 : 0;
      ped.panic = 1;
      hit = true;
      addParticles(G, ped.x, ped.y, 6, '#ffd76a', 140, 0.35, 4);
    }
  }
  for (const cop of G.cops) {
    if (cop.state === 'down') continue;
    if (Math.hypot(cop.x - fx, cop.y - fy) < 34) {
      cop.hp -= PLAYER.punchDamage;
      cop.state = cop.hp <= 0 ? 'down' : 'chase';
      cop.downTimer = cop.hp <= 0 ? 6 : 0;
      hit = true;
      addWanted(G, 1);
      addParticles(G, cop.x, cop.y, 6, '#ffd76a', 140, 0.35, 4);
    }
  }
  if (hit) addWanted(G, 1);
}

export function shootAt(G, wx, wy) {
  const p = G.player;
  if (p.shootCooldown > 0 || p.ammo <= 0 || p.inCar) return;
  p.shootCooldown = 0.22;
  p.ammo -= 1;
  p.angle = Math.atan2(wy - p.y, wx - p.x);
  G.audio.shot();
  addParticles(G, p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 4, '#ffd76a', 200, 0.15, 3);
  const dx = Math.cos(p.angle);
  const dy = Math.sin(p.angle);
  let bestD = PLAYER.pistolRange;
  let target = null;
  let targetKind = null;
  function consider(x, y, d, kind, ref) {
    const along = (x - p.x) * dx + (y - p.y) * dy;
    if (along < 0 || along > bestD) return;
    const perp = Math.abs((x - p.x) * dy - (y - p.y) * dx);
    if (perp < 18) { bestD = along; target = ref; targetKind = kind; }
  }
  for (const ped of G.peds) if (ped.state !== 'down') consider(ped.x, ped.y, 0, 'ped', ped);
  for (const cop of G.cops) if (cop.state !== 'down') consider(cop.x, cop.y, 0, 'cop', cop);
  for (const car of G.cars) if (!car.dead) consider(car.x, car.y, 0, 'car', car);
  if (target) {
    addParticles(G, target.x, target.y, 8, '#ff6b5e', 160, 0.4, 4);
    if (targetKind === 'ped') {
      target.hp -= PLAYER.pistolDamage;
      target.state = target.hp <= 0 ? 'down' : 'flee';
      target.downTimer = target.hp <= 0 ? 6 : 0;
      target.panic = 1;
      addWanted(G, 1);
    } else if (targetKind === 'cop') {
      target.hp -= PLAYER.pistolDamage;
      target.state = target.hp <= 0 ? 'down' : 'chase';
      target.downTimer = target.hp <= 0 ? 8 : 0;
      addWanted(G, 1);
    } else {
      damageCar(G, target, PLAYER.pistolDamage);
      if (target.driver === 'police' || target.driver === 'traffic') addWanted(G, 1);
    }
  }
  // Every shot nearby scares the street.
  for (const ped of G.peds) {
    if (Math.hypot(ped.x - p.x, ped.y - p.y) < 320) { ped.state = 'flee'; ped.panic = 1; }
  }
}

function updatePlayerOnFoot(G, dt, move, actions, aimX, aimY) {
  const p = G.player;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  const speed = move.run ? PLAYER.run : PLAYER.walk;
  const len = Math.hypot(move.x, move.y);
  p.moving = len > 0;
  if (len > 0) {
    const nx = move.x / len;
    const ny = move.y / len;
    slide(G.world, p, nx * speed * dt, ny * speed * dt, PLAYER.radius);
    p.angle = Math.atan2(ny, nx);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  if (aimX !== null && (p.shootCooldown > 0 || G.mouseDown)) {
    p.angle = Math.atan2(aimY - p.y, aimX - p.x);
  }
  if (actions.punch) punch(G);
  if (actions.enter) tryEnterCar(G);
  if (actions.shoot) shootAt(G, aimX ?? p.x + Math.cos(p.angle) * 100, aimY ?? p.y + Math.sin(p.angle) * 100);
  // Slow health regen when out of trouble.
  p.regenTimer += dt;
  if (p.regenTimer > 8 && p.hp > 0 && p.hp < PLAYER.health) {
    p.hp = Math.min(PLAYER.health, p.hp + 6 * dt);
  }
}

function updateDriving(G, dt, drive, actions) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  const spec = CAR.types[car.type];
  car.speed += drive.throttle * spec.accel * dt;
  if (drive.brake) car.speed *= Math.max(0, 1 - 3.2 * dt);
  car.speed -= car.speed * 0.55 * dt; // drag
  car.speed = Math.max(-spec.top * 0.4, Math.min(spec.top, car.speed));
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 140);
  car.angle += drive.steer * spec.grip * steerAuthority * dt * Math.sign(car.speed || 1);
  car.angle = normAngle(car.angle);
  const nx = Math.cos(car.angle) * car.speed * dt;
  const ny = Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x;
  const beforeY = car.y;
  if (!G.world.blocked(car.x + nx, car.y + ny, 26)) {
    car.x += nx;
    car.y += ny;
  } else {
    // Hit a building: bounce off, take damage, leave a mark.
    if (Math.abs(car.speed) > 200) {
      damageCar(G, car, Math.abs(car.speed) * 0.06);
      addParticles(G, car.x, car.y, 10, '#ffd76a', 200, 0.4, 4);
      G.audio.crash();
      G.shake = Math.max(G.shake, 5);
    }
    car.speed *= -0.25;
  }
  if (drive.brake && Math.abs(car.speed) > 120) {
    G.skid.push({ x: car.x, y: car.y, angle: car.angle, life: 2.5 });
    if (G.skid.length > 240) G.skid.shift();
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = Math.abs(car.speed);
  car.brakeLight = drive.brake || drive.throttle < 0;
  if (Math.hypot(car.x - beforeX, car.y - beforeY) < 0.5 && Math.abs(car.speed) > 30) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2) { car.speed = 0; car.stuckTimer = 0; }
  } else {
    car.stuckTimer = 0;
  }
  if (actions.enter) exitCar(G);
  // Running over pedestrians is a crime, and it hurts.
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && Math.abs(car.speed) > 60) {
      ped.state = 'down';
      ped.hp = 0;
      ped.downTimer = 6;
      addWanted(G, 1);
      addParticles(G, ped.x, ped.y, 8, '#ff6b5e', 150, 0.5, 4);
      G.audio.punch();
    }
  }
}

function updateTrafficCar(G, car, dt) {
  if (car.dead || car.driver !== 'traffic') return;
  car.turnCooldown = Math.max(0, car.turnCooldown - dt);
  // Slow down for the car ahead.
  const ahead = carAhead(G, car);
  const want = ahead ? 0 : car.targetSpeed;
  car.speed += Math.sign(want - car.speed) * 260 * dt;
  car.speed = Math.max(0, Math.min(car.targetSpeed, car.speed));
  const step = car.speed * dt;
  let nx = car.x;
  let ny = car.y;
  if (car.heading === 0) nx += step;
  if (car.heading === 2) nx -= step;
  if (car.heading === 1) ny += step;
  if (car.heading === 3) ny -= step;
  // At an intersection, sometimes turn onto the cross street.
  if (car.turnCooldown <= 0 && car.speed > 40) {
    const cross = crossingNear(G, car);
    if (cross && G.rng.chance(0.02)) {
      const options = car.heading % 2 === 0 ? [1, 3] : [0, 2];
      const next = G.rng.pick(options);
      car.heading = next;
      car.angle = headingAngle(next);
      car.x = cross.x;
      car.y = cross.y;
      car.turnCooldown = 2;
      return;
    }
  }
  if (G.world.blocked(nx, ny, 24)) {
    // End of the road: turn around.
    car.heading = (car.heading + 2) % 4;
    car.angle = headingAngle(car.heading);
    car.turnCooldown = 1;
    return;
  }
  car.x = nx;
  car.y = ny;
  car.angle = headingAngle(car.heading);
}

function carAhead(G, car) {
  const dx = [1, 0, -1, 0][car.heading];
  const dy = [0, 1, 0, -1][car.heading];
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const along = rx * dx + ry * dy;
    const perp = Math.abs(rx * dy - ry * dx);
    if (along > 0 && along < 84 && perp < 30) return other;
  }
  return null;
}

/** The intersection a car is crossing right now, if any. */
function crossingNear(G, car) {
  const half = 8;
  if (car.heading % 2 === 0) {
    for (const v of ROADS_V) {
      if (Math.abs(car.x - v) < half && isRoad(car.x, car.y)) return { x: v, y: car.y };
    }
  } else {
    for (const h of ROADS_H) {
      if (Math.abs(car.y - h) < half && isRoad(car.x, car.y)) return { x: car.x, y: h };
    }
  }
  return null;
}

function updatePed(G, ped, dt) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.hp = 100;
      const p = G.world.sidewalkPoint();
      ped.tx = p.x;
      ped.ty = p.y;
    }
    return;
  }
  let speed = ped.speed;
  let tx = ped.tx;
  let ty = ped.ty;
  if (ped.state === 'flee') {
    ped.panic = Math.max(0, ped.panic - dt * 0.25);
    if (ped.panic <= 0) ped.state = 'walk';
    speed = 260;
    const away = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
    tx = ped.x + Math.cos(away) * 200;
    ty = ped.y + Math.sin(away) * 200;
  }
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12) {
    if (ped.state === 'walk') {
      const p = G.world.sidewalkPoint();
      ped.tx = p.x;
      ped.ty = p.y;
    }
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  slide(G.world, ped, (dx / dist) * speed * dt, (dy / dist) * speed * dt, 12);
}

function spawnCopCar(G) {
  const angle = G.rng.range(0, Math.PI * 2);
  const dist = G.rng.range(520, 680);
  const x = Math.max(80, Math.min(G.world.width - 80, G.player.x + Math.cos(angle) * dist));
  const y = Math.max(80, Math.min(G.world.height - 80, G.player.y + Math.sin(angle) * dist));
  const near = nearestRoad(x, y);
  const px = near.axis === 'v' ? near.at : x;
  const py = near.axis === 'h' ? near.at : y;
  const car = makeCar(G, 'police', px, py, headingAngle(0), 'police');
  car.targetSpeed = 0;
  G.cars.push(car);
  return car;
}

function spawnFootCop(G) {
  const angle = G.rng.range(0, Math.PI * 2);
  const dist = G.rng.range(420, 560);
  const x = Math.max(40, Math.min(G.world.width - 40, G.player.x + Math.cos(angle) * dist));
  const y = Math.max(40, Math.min(G.world.height - 40, G.player.y + Math.sin(angle) * dist));
  G.cops.push({ x, y, angle, speed: 305, hp: 100, state: 'chase', grab: 0, downTimer: 0 });
}

function updatePolice(G, dt) {
  const wantCars = G.wanted >= 2 ? Math.min(G.wanted - 1, 4) : 0;
  const wantFoot = G.wanted >= 1 ? Math.min(G.wanted + 1, 4) : 0;
  const liveCars = G.cars.filter((c) => c.driver === 'police' && !c.dead);
  const liveFoot = G.cops.filter((c) => c.state !== 'down');
  if (liveCars.length < wantCars && G.rng.chance(0.02)) spawnCopCar(G);
  if (liveFoot.length < wantFoot && G.rng.chance(0.03)) spawnFootCop(G);

  for (const car of liveCars) {
    const p = G.player;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const dist = Math.hypot(dx, dy);
    const spec = CAR.types.police;
    if (p.inCar) {
      // Ram the getaway car.
      const want = Math.atan2(dy, dx);
      car.angle += Math.max(-spec.grip * dt, Math.min(spec.grip * dt, normAngle(want - car.angle)));
      car.speed = Math.min(spec.top, car.speed + spec.accel * dt);
      const nx = Math.cos(car.angle) * car.speed * dt;
      const ny = Math.sin(car.angle) * car.speed * dt;
      if (!G.world.blocked(car.x + nx, car.y + ny, 26)) {
        car.x += nx;
        car.y += ny;
      } else {
        car.speed *= 0.4;
        car.angle += 0.6 * dt * (G.rng.chance(0.5) ? 1 : -1);
      }
      if (dist < 52 && Math.abs(car.speed) > 120) {
        damageCar(G, p.inCar, 12);
        car.speed *= 0.5;
        G.audio.crash();
        G.shake = Math.max(G.shake, 4);
      }
    } else if (dist > 110) {
      // Drive up to the suspect, then the officer gets out on foot.
      const want = Math.atan2(dy, dx);
      car.angle += Math.max(-spec.grip * dt, Math.min(spec.grip * dt, normAngle(want - car.angle)));
      car.speed = Math.min(420, car.speed + spec.accel * dt);
      const nx = Math.cos(car.angle) * car.speed * dt;
      const ny = Math.sin(car.angle) * car.speed * dt;
      if (!G.world.blocked(car.x + nx, car.y + ny, 26)) {
        car.x += nx;
        car.y += ny;
      } else {
        car.speed *= 0.4;
      }
    } else {
      car.speed = Math.max(0, car.speed - 500 * dt);
      if (liveFoot.length < 4 && G.rng.chance(0.01)) {
        car.driver = 'parked';
        spawnFootCop(G);
        G.cops[G.cops.length - 1].x = car.x + 40;
        G.cops[G.cops.length - 1].y = car.y;
      }
    }
  }

  let events = 0;
  for (const cop of G.cops) {
    if (cop.state === 'down') {
      cop.downTimer -= dt;
      if (cop.downTimer <= 0) { cop.state = 'chase'; cop.hp = 100; }
      continue;
    }
    const p = G.player;
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 900) {
      // Lost the trail: walk back off the scene.
      cop.state = 'gone';
      continue;
    }
    if (p.inCar) {
      // On foot a cop cannot catch a car: head for the nearest police car.
      const car = G.cars.find((c) => c.driver === 'police' && !c.dead);
      if (car) {
        cop.angle = Math.atan2(car.y - cop.y, car.x - cop.x);
        slide(G.world, cop, Math.cos(cop.angle) * 320 * dt, Math.sin(cop.angle) * 320 * dt, 12);
        if (Math.hypot(car.x - cop.x, car.y - cop.y) < 40) cop.state = 'gone';
        continue;
      }
    }
    cop.angle = Math.atan2(dy, dx);
    slide(G.world, cop, Math.cos(cop.angle) * cop.speed * dt, Math.sin(cop.angle) * cop.speed * dt, 12);
    if (dist < 30) {
      cop.grab += dt;
      if (cop.grab > 1.2) events |= EVENT_BUSTED;
    } else {
      cop.grab = Math.max(0, cop.grab - dt);
    }
  }
  G.cops = G.cops.filter((c) => c.state !== 'gone');
  return events;
}

/** One fixed step of the whole street: player, traffic, peds, police. */
export function updateEntities(G, dt, move, drive, actions, aim) {
  const p = G.player;
  if (p.inCar) updateDriving(G, dt, drive, actions);
  else updatePlayerOnFoot(G, dt, move, actions, aim.x, aim.y);

  for (const car of G.cars) {
    if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
  }
  for (let i = 0; i < G.cars.length; i += 1) {
    for (let j = i + 1; j < G.cars.length; j += 1) collideCars(G, G.cars[i], G.cars[j]);
  }
  for (const ped of G.peds) updatePed(G, ped, dt);
  const events = updatePolice(G, dt);

  // Wanted fades after a quiet stretch with no cop in sight.
  if (G.wanted > 0) {
    const copNear = G.cops.some((c) => c.state !== 'down' && Math.hypot(c.x - p.x, c.y - p.y) < WANTED.sightRange)
      || G.cars.some((c) => c.driver === 'police' && !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < WANTED.sightRange);
    if (copNear) G.quietTime = 0;
    else {
      G.quietTime += dt;
      if (G.quietTime > WANTED.decaySeconds) {
        G.wanted -= 1;
        G.quietTime = 0;
      }
    }
  }

  // Pickups.
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    pk.bob += dt * 3;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        G.cash += pk.value;
        G.banner = { text: `+$${pk.value}`, sub: '', t: 1.2 };
      } else {
        p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + pk.value);
        G.banner = { text: `+${pk.value} ammo`, sub: '', t: 1.2 };
      }
      G.audio.pickup();
      addParticles(G, pk.x, pk.y, 10, '#ffcf3f', 140, 0.5, 4);
    }
  }
  if (G.pickups.every((pk) => pk.taken)) {
    G.pickups = [];
    spawnPickups(G);
  }

  // Particles and skid marks age out.
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const pt = G.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.98;
    pt.vy *= 0.98;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.skid.length - 1; i >= 0; i -= 1) {
    G.skid[i].life -= dt;
    if (G.skid[i].life <= 0) G.skid.splice(i, 1);
  }
  for (const car of G.cars) {
    if (car.smoke > 0 && !car.dead) {
      car.smoke -= dt * 0.25;
      if (G.rng.chance(0.3)) {
        G.particles.push({
          x: car.x + G.rng.range(-14, 14), y: car.y + G.rng.range(-14, 14),
          vx: G.rng.range(-8, 8), vy: -26, life: 1.1, maxLife: 1.1,
          size: 7, color: '#5a5f6a',
        });
      }
    }
  }

  // The clock: a full day every DAY_LENGTH seconds.
  G.time += dt;
  if (p.hp <= 0) return events | EVENT_WASTED;
  return events;
}
