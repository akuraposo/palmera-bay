// Palmera Bay — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between five screens: title, play, paused, wasted and busted.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { DAY_LENGTH, SAVE_KEY, STEP, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOOT, createInput } from './input.js';
import {
  EVENT_BUSTED, EVENT_WASTED, createPlayer, spawnParkedCars, spawnPeds,
  spawnPickups, spawnTraffic, updateEntities,
} from './entities.js';
import { buildMissions, createMissionState, resetMissionStep, startMission, updateMissions } from './missions.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const START_CASH = 150;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

/** A whole fresh game: city, people, cars, missions and the player's state. */
function createGame(gameSeed) {
  const rng = createRandom(gameSeed);
  const world = createWorld(rng);
  const G = {
    rng, world, audio,
    player: null, cars: [], peds: [], cops: [], particles: [], skid: [], pickups: [],
    cash: START_CASH, wanted: 0, quietTime: 0,
    time: 0.12 * DAY_LENGTH, clock: 0,
    banner: null, hint: '', shake: 0, mouseDown: false,
    stats: { missionsDone: 0, carsStolen: 0 },
    mission: createMissionState(), missions: [], nextMissionIn: null,
  };
  G.missions = buildMissions(world);
  G.player = createPlayer(world);
  spawnParkedCars(G);
  spawnTraffic(G);
  spawnPeds(G);
  spawnPickups(G);
  return G;
}

const G = createGame(seed);
window.__game = G;
const renderer = createRenderer(canvas);
const input = createInput(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const prev = readSave();
    const best = Math.max(prev?.best ?? 0, G.cash);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash,
      missionIndex: G.mission.index,
      completed: G.mission.completed,
      best,
      carsStolen: G.stats.carsStolen,
      missionsDone: G.stats.missionsDone,
    }));
    return best;
  } catch {
    return G.cash;
  }
}

/** One fixed step of the live game: streets, then missions, then the chrome. */
function stepGame(game, controls, dt) {
  game.hint = '';
  const events = updateEntities(game, dt, controls.move, controls.drive, controls.actions, controls.aim);
  updateMissions(game, dt);
  if (game.banner) {
    game.banner.t -= dt;
    if (game.banner.t <= 0) game.banner = null;
  }
  game.shake = Math.max(0, game.shake - dt * 30);
  game.clock += dt;
  const p = game.player;
  const speed01 = p.inCar ? Math.abs(p.inCar.speed) / 760 : (p.moving ? 0.25 : 0);
  const siren = game.wanted > 0 && (
    game.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 700)
    || game.cars.some((c) => c.driver === 'police' && !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 700)
  );
  game.audio.update(speed01, siren, game.time);
  return events;
}

/** Screen pixel -> world point, using the same camera math as the renderer. */
function screenToWorld(mx, my) {
  const scale = Math.max(window.innerWidth / 1280, window.innerHeight / 720);
  const viewW = window.innerWidth / scale;
  const viewH = window.innerHeight / scale;
  let camX = G.player.x - viewW / 2;
  let camY = G.player.y - viewH / 2;
  camX = Math.max(0, Math.min(WORLD.width - viewW, camX));
  camY = Math.max(0, Math.min(WORLD.height - viewH, camY));
  return { x: camX + mx / scale, y: camY + my / scale };
}

function runShot(name) {
  const scene = stageShot(name, G, stepGame);
  let painted = 0;
  function paint() {
    renderer.draw(G, scene.screen, { best: 0, muted: false, hasSave: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readSave()?.best ?? 0;
  let saveTimer = 0;
  window.__screen = screen;

  function announce(message) {
    status.textContent = message;
  }

  function applySave(save) {
    if (!save) return;
    G.cash = save.cash ?? START_CASH;
    G.mission.completed = save.completed ?? [];
    G.stats.carsStolen = save.carsStolen ?? 0;
    G.stats.missionsDone = save.missionsDone ?? 0;
    const next = G.missions.findIndex((m) => !G.mission.completed.includes(m.id));
    G.mission.index = next === -1 ? G.missions.length - 1 : next;
    if (next === -1) G.mission.allDone = true;
  }

  function startGame() {
    const save = readSave();
    if (save) {
      applySave(save);
      if (!G.mission.allDone) startMission(G, G.mission.index);
    } else {
      startMission(G, 0);
    }
    best = Math.max(best, G.cash);
    screen = SCREEN_PLAY;
    window.__screen = screen;
    announce('Playing Palmera Bay. Follow the yellow marker.');
  }

  function endRun(nextScreen, fine, respawn) {
    const p = G.player;
    G.cash = Math.max(0, G.cash - fine);
    G.wanted = 0;
    G.quietTime = 0;
    G.cops = [];
    for (const car of G.cars) if (car.driver === 'police') car.driver = 'parked';
    if (p.inCar) {
      p.inCar.driver = 'parked';
      p.inCar = null;
    }
    p.hp = 100;
    p.x = respawn.x;
    p.y = respawn.y;
    p.angle = -Math.PI / 2;
    resetMissionStep(G);
    saveGame();
    screen = nextScreen;
    window.__screen = screen;
    announce(nextScreen === SCREEN_WASTED ? 'Wasted. Press Space to get back out there.' : 'Busted. Press Space to get back out there.');
  }

  function handleEvents(events) {
    if (events & EVENT_WASTED) {
      const hospital = G.world.special.hospital;
      audio.fail();
      endRun(SCREEN_WASTED, 150, { x: hospital.x, y: hospital.y + 110 });
    } else if (events & EVENT_BUSTED) {
      const station = G.world.special.station;
      audio.fail();
      endRun(SCREEN_BUSTED, 200, { x: station.x, y: station.y + 110 });
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const mouse = input.mouse();
    G.mouseDown = mouse.down;
    const aim = screenToWorld(mouse.x, mouse.y);
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.toggleMute();
    }
    input.unlockAudio(audio);

    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_WASTED || screen === SCREEN_BUSTED)) {
      audio.unlock();
      audio.click();
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      window.__screen = screen;
      announce('Paused.');
      return;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      window.__screen = screen;
      announce('Playing.');
      return;
    }

    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title.
      stepGame(G, { move: { x: 0, y: 0, run: false }, drive: { throttle: 0, steer: 0, brake: false }, actions: {}, aim: { x: null, y: null } }, STEP);
      renderer.draw(G, screen, { best, muted: audio.muted, hasSave: !!readSave() });
      return;
    }
    if (screen !== SCREEN_PLAY) {
      renderer.draw(G, screen, { best, muted: audio.muted, hasSave: !!readSave() });
      return;
    }

    const controls = {
      move: input.move(),
      drive: input.drive(),
      actions: {
        punch: !!(actions & ACTION_PUNCH),
        enter: !!(actions & ACTION_ENTER),
        shoot: !!(actions & ACTION_SHOOT),
      },
      aim,
    };
    // Fixed steps, several in a slow frame; the edge actions fire once.
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    let first = true;
    let events = 0;
    while (accumulator >= STEP && screen === SCREEN_PLAY) {
      const stepControls = first
        ? controls
        : { move: controls.move, drive: controls.drive, actions: {}, aim: controls.aim };
      events |= stepGame(G, stepControls, STEP);
      accumulator -= STEP;
      first = false;
    }
    handleEvents(events);
    saveTimer += dt;
    if (saveTimer > 6) {
      saveTimer = 0;
      best = saveGame();
    }
    renderer.draw(G, screen, { best, muted: audio.muted, hasSave: true });
  }

  let accumulator = 0;
  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      window.__screen = screen;
      announce('Paused.');
    }
  });
  announce('Palmera Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
