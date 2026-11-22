// The story of Palmera Bay: five jobs handed out by phone, each a short
// chain of steps — steal a car, run packages, lift the Comet GT, shake a
// three-star tail, rob the First Bay Bank. This module owns the mission
// list, the current objective, and what happens when a step is done.
import { addWanted } from './entities.js';

export function buildMissions(world) {
  const S = world.special;
  const park = world.park;
  return [
    {
      id: 'back-in-the-bay', title: 'Back in the Bay', contact: 'Milo',
      intro: 'Deke! You are back. Grab some wheels and meet me at the garage.',
      reward: 200,
      steps: [
        { kind: 'stealAny', text: 'Steal a car  (walk up to one and press E)' },
        { kind: 'goto', x: S.garage.x, y: S.garage.y + 150, radius: 90, text: 'Drive to Milo\'s garage' },
      ],
    },
    {
      id: 'package-run', title: 'Package Run', contact: 'Rosa',
      intro: 'Three parcels, three corners of the Bay. No questions, no cops.',
      reward: 450,
      steps: [
        {
          kind: 'collect', radius: 46, text: 'Collect the packages (0/3)',
          items: [
            { x: park ? (park.x0 + park.x1) / 2 : 1200, y: park ? (park.y0 + park.y1) / 2 : 800, label: 'Park parcel' },
            { x: S.chopshop.x - 120, y: S.chopshop.y + 60, label: 'Docks parcel' },
            { x: 1500, y: 2520, label: 'Beach parcel' },
          ],
        },
        { kind: 'goto', x: S.chopshop.x, y: S.chopshop.y + 130, radius: 90, text: 'Deliver the packages to the docks' },
      ],
    },
    {
      id: 'hot-wheels', title: 'Hot Wheels', contact: 'Del',
      intro: 'A yellow Comet GT is parked at the marina. It is mine by midnight.',
      reward: 800,
      steps: [
        { kind: 'steal', tag: 'comet', text: 'Steal the yellow Comet GT at the marina' },
        { kind: 'goto', x: S.chopshop.x, y: S.chopshop.y + 130, radius: 90, text: 'Deliver the Comet to the chop shop' },
      ],
    },
    {
      id: 'heat-check', title: 'Heat Check', contact: 'Milo',
      intro: 'The Bay PD is all over you. Lose them — or this ends in cuffs.',
      reward: 600,
      steps: [
        { kind: 'survive', seconds: 35, text: 'Survive the heat — stay out of cuffs' },
        { kind: 'lose', text: 'Lose the cops — wanted level back to zero' },
      ],
    },
    {
      id: 'palmera-job', title: 'The Palmera Job', contact: 'Vera',
      intro: 'First Bay Bank. In, out, rich. The whole Bay will be looking.',
      reward: 2500,
      steps: [
        { kind: 'goto', x: S.bank.x, y: S.bank.y + 110, radius: 90, text: 'Get to the First Bay Bank' },
        { kind: 'rob', x: S.bank.x, y: S.bank.y, radius: 130, seconds: 6, text: 'Grab the cash — stay inside the bank' },
        { kind: 'goto', x: S.garage.x, y: S.garage.y + 150, radius: 90, text: 'Escape to the hideout with the cash' },
      ],
    },
  ];
}

export function createMissionState() {
  return {
    index: 0, step: 0, active: false, completed: [],
    collected: [], timer: 0, progress: 0, allDone: false,
  };
}

export function startMission(G, index) {
  const mission = G.missions[index];
  if (!mission) return;
  const M = G.mission;
  M.index = index;
  M.step = 0;
  M.active = true;
  M.collected = [];
  M.timer = 0;
  M.progress = 0;
  G.banner = { text: mission.title, sub: `${mission.contact}: ${mission.intro}`, t: 4.5 };
  G.audio.phone();
  const step = mission.steps[0];
  if (step.kind === 'survive') {
    M.timer = step.seconds;
    addWanted(G, 3);
  }
}

function advanceStep(G) {
  const M = G.mission;
  const mission = G.missions[M.index];
  M.step += 1;
  M.collected = [];
  M.progress = 0;
  if (M.step >= mission.steps.length) {
    // Job done: pay out and ring the next one in a few seconds.
    G.cash += mission.reward;
    M.completed.push(mission.id);
    M.active = false;
    G.banner = { text: `Job complete: ${mission.title}`, sub: `+$${mission.reward}`, t: 4 };
    G.audio.jingle();
    G.stats.missionsDone += 1;
    if (M.index + 1 < G.missions.length) {
      G.nextMissionIn = 5;
    } else {
      M.allDone = true;
      G.banner = { text: 'Story complete!', sub: 'Palmera Bay is yours — free roam, keep the cash coming.', t: 6 };
    }
    return;
  }
  const step = mission.steps[M.step];
  if (step.kind === 'survive') {
    M.timer = step.seconds;
    addWanted(G, 2);
  }
  G.audio.click();
}

/** The current objective for the HUD, the minimap and the compass arrow. */
export function currentObjective(G) {
  const M = G.mission;
  if (!M.active) return null;
  const mission = G.missions[M.index];
  const step = mission.steps[M.step];
  if (!step) return null;
  if (step.kind === 'goto' || step.kind === 'rob') return { x: step.x, y: step.y, text: step.text };
  if (step.kind === 'collect') {
    const left = step.items.filter((_, i) => !M.collected.includes(i));
    if (left.length === 0) return null;
    let best = left[0];
    let bestD = Infinity;
    for (const item of left) {
      const d = Math.hypot(item.x - G.player.x, item.y - G.player.y);
      if (d < bestD) { bestD = d; best = item; }
    }
    return { x: best.x, y: best.y, text: `${step.text} — ${best.label}` };
  }
  if (step.kind === 'steal') {
    const car = G.cars.find((c) => c.tag === step.tag);
    if (car) return { x: car.x, y: car.y, text: step.text };
    return null;
  }
  if (step.kind === 'stealAny') {
    const car = G.cars.find((c) => (c.driver === 'parked' || c.driver === 'traffic') && !c.dead);
    if (car) return { x: car.x, y: car.y, text: step.text };
    return null;
  }
  return { x: G.player.x, y: G.player.y, text: step.text };
}

export function updateMissions(G, dt) {
  const M = G.mission;
  if (!M.active) {
    if (G.nextMissionIn !== null && G.nextMissionIn !== undefined) {
      G.nextMissionIn -= dt;
      if (G.nextMissionIn <= 0) {
        G.nextMissionIn = null;
        startMission(G, M.index + 1);
      }
    }
    return;
  }
  const mission = G.missions[M.index];
  const step = mission.steps[M.step];
  const p = G.player;
  if (step.kind === 'stealAny') {
    if (p.inCar) advanceStep(G);
  } else if (step.kind === 'steal') {
    if (p.inCar && p.inCar.tag === step.tag) advanceStep(G);
  } else if (step.kind === 'goto') {
    if (Math.hypot(p.x - step.x, p.y - step.y) < step.radius) advanceStep(G);
  } else if (step.kind === 'collect') {
    step.items.forEach((item, i) => {
      if (!M.collected.includes(i) && Math.hypot(p.x - item.x, p.y - item.y) < step.radius) {
        M.collected.push(i);
        G.audio.pickup();
        G.banner = { text: `Package ${M.collected.length}/${step.items.length}`, sub: item.label, t: 1.6 };
      }
    });
    if (M.collected.length >= step.items.length) advanceStep(G);
  } else if (step.kind === 'survive') {
    M.timer -= dt;
    if (M.timer <= 0) advanceStep(G);
  } else if (step.kind === 'lose') {
    if (G.wanted === 0) advanceStep(G);
  } else if (step.kind === 'rob') {
    if (Math.hypot(p.x - step.x, p.y - step.y) < step.radius && !p.inCar) {
      M.progress += dt;
      if (M.progress >= step.seconds) {
        G.cash += 1500;
        addWanted(G, 4);
        G.banner = { text: 'The vault is empty!', sub: '+$1,500 — now run!', t: 3.5 };
        advanceStep(G);
      }
    } else {
      M.progress = Math.max(0, M.progress - dt * 0.5);
    }
  }
}

/** A mission step failed (busted / wasted): restart the step, keep the job. */
export function resetMissionStep(G) {
  const M = G.mission;
  M.collected = [];
  M.progress = 0;
  const mission = G.missions[M.index];
  if (mission && mission.steps[M.step] && mission.steps[M.step].kind === 'survive') {
    M.timer = mission.steps[M.step].seconds;
  }
}
