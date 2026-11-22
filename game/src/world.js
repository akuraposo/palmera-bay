// The city of Palmera Bay: a road grid, blocks of buildings, a park, the
// docks, the beach and the water, all laid out from a seed. This module owns
// the map and the only collision questions the game asks: is this point on a
// road, and does this circle hit a building or the edge of the world?
import { BEACH_Y, ROAD_WIDTH, ROADS_H, ROADS_V, SIDEWALK, WORLD } from './config.js';

const ROOF_COLORS = ['#b0705a', '#a8675c', '#c08a5e', '#8f7d6b', '#b98a6d', '#7d9bb0', '#c2a15e'];
const WALL_COLORS = ['#8a5a48', '#7d4f45', '#96684e', '#6f6355', '#97714f', '#5f7484', '#a37f4d'];

/** Is (x, y) on a road surface (not the sidewalk)? */
export function isRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const cx of ROADS_V) if (Math.abs(x - cx) <= half) return true;
  for (const cy of ROADS_H) if (Math.abs(y - cy) <= half) return true;
  return false;
}

/** The nearest road centreline to (x, y): { axis: 'v' | 'h', at: number }. */
export function nearestRoad(x, y) {
  let bestV = ROADS_V[0];
  for (const cx of ROADS_V) if (Math.abs(x - cx) < Math.abs(x - bestV)) bestV = cx;
  let bestH = ROADS_H[0];
  for (const cy of ROADS_H) if (Math.abs(y - cy) < Math.abs(y - bestH)) bestH = cy;
  return Math.abs(x - bestV) <= Math.abs(y - bestH)
    ? { axis: 'v', at: bestV }
    : { axis: 'h', at: bestH };
}

function blockRects() {
  const xs = [0, ...ROADS_V, WORLD.width];
  const ys = [0, ...ROADS_H, WORLD.height];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + (i === 0 ? 0 : ROAD_WIDTH / 2 + SIDEWALK);
      const x1 = xs[i + 1] - (i + 1 === xs.length - 1 ? 0 : ROAD_WIDTH / 2 + SIDEWALK);
      const y0 = ys[j] + (j === 0 ? 0 : ROAD_WIDTH / 2 + SIDEWALK);
      const y1 = ys[j + 1] - (j + 1 === ys.length - 1 ? 0 : ROAD_WIDTH / 2 + SIDEWALK);
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      blocks.push({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
  }
  return blocks;
}

export function createWorld(rng) {
  const buildings = [];
  const trees = [];
  const props = [];
  const special = {};

  const blocks = blockRects();
  // The park: the big block north-west of downtown. The docks: the far-east
  // strip. The beach is the sand band south of BEACH_Y, drawn, not built on.
  const park = blocks.find((b) => b.cx > 1000 && b.cx < 1500 && b.cy > 500 && b.cy < 1000);
  const docks = blocks.filter((b) => b.x0 > 2900 && b.cy > 1400 && b.cy < 2200);

  function addBuilding(x, y, w, h, kind, name) {
    const downtown = x > 1300 && x < 2200 && y > 800 && y < 1500;
    const tall = kind === 'tower' || (downtown && rng.chance(0.5));
    const building = {
      x, y, w, h, kind, name: name ?? null,
      height: tall ? rng.range(34, 62) : rng.range(10, 26),
      roof: rng.pick(ROOF_COLORS),
      wall: rng.pick(WALL_COLORS),
    };
    buildings.push(building);
    return building;
  }

  function fillBlock(b, kind, names) {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const count = w > 300 && h > 220 && rng.chance(0.6) ? 2 : 1;
    if (count === 1) {
      const bw = w * rng.range(0.45, 0.62);
      const bh = h * rng.range(0.45, 0.62);
      addBuilding(b.cx - bw / 2, b.cy - bh / 2, bw, bh, kind, names ? names[0] : null);
      return;
    }
    const split = rng.chance(0.5);
    for (let k = 0; k < 2; k += 1) {
      const bw = split ? w * 0.42 : w * rng.range(0.4, 0.55);
      const bh = split ? h * rng.range(0.4, 0.55) : h * 0.42;
      const bx = split ? b.x0 + 14 + k * (w / 2) : b.cx - bw / 2;
      const by = split ? b.cy - bh / 2 : b.y0 + 14 + k * (h / 2);
      addBuilding(bx, by, bw, bh, kind, names ? names[k] : null);
    }
  }

  for (const b of blocks) {
    if (b.cy > BEACH_Y) continue; // sand, no buildings
    if (park && b === park) {
      for (let i = 0; i < 14; i += 1) {
        trees.push({ x: rng.range(b.x0 + 20, b.x1 - 20), y: rng.range(b.y0 + 20, b.y1 - 20), park: true });
      }
      props.push({ kind: 'pond', x: b.cx - 70, y: b.cy - 40, w: 140, h: 80 });
      continue;
    }
    if (docks.includes(b)) {
      for (let i = 0; i < 5; i += 1) {
        props.push({
          kind: 'container',
          x: rng.range(b.x0 + 10, b.x1 - 90),
          y: rng.range(b.y0 + 10, b.y1 - 50),
          w: 78, h: 40,
          color: rng.pick(['#b3543f', '#3f7d8a', '#c2a15e', '#5d7d5a']),
        });
      }
      continue;
    }
    const downtown = b.cx > 1300 && b.cx < 2200 && b.cy > 800 && b.cy < 1500;
    fillBlock(b, downtown ? 'tower' : rng.pick(['house', 'shop', 'house', 'shop']), null);
  }

  // Named places the missions use, each a real building on the map.
  function placeSpecial(cx, cy, w, h, kind, name) {
    const building = addBuilding(cx - w / 2, cy - h / 2, w, h, kind, name);
    special[name] = { x: cx, y: cy, w, h, building };
    return building;
  }
  // Clear any filler that overlaps a special site, then put the site in.
  function clearAround(cx, cy, r) {
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const b = buildings[i];
      if (b.x < cx + r && b.x + b.w > cx - r && b.y < cy + r && b.y + b.h > cy - r) buildings.splice(i, 1);
    }
  }
  clearAround(1450, 1325, 260);
  placeSpecial(1450, 1325, 190, 130, 'bank', 'bank'); // First Bay Bank
  clearAround(450, 2200, 240);
  placeSpecial(450, 2200, 170, 120, 'garage', 'garage'); // Milo's garage / hideout
  clearAround(2450, 425, 240);
  placeSpecial(2450, 425, 170, 120, 'station', 'station'); // Bay PD station
  clearAround(950, 1775, 240);
  placeSpecial(950, 1775, 170, 120, 'hospital', 'hospital'); // St. Marisol hospital
  clearAround(2950, 1750, 200);
  placeSpecial(2950, 1750, 150, 100, 'warehouse', 'chopshop'); // Del's chop shop
  clearAround(2700, 2450, 180);
  placeSpecial(2700, 2450, 150, 90, 'marina', 'marina'); // Marina office

  // Palms along the sidewalks and the beachfront.
  for (const cx of ROADS_V) {
    for (let y = 120; y < BEACH_Y; y += 260) {
      if (rng.chance(0.55)) trees.push({ x: cx + ROAD_WIDTH / 2 + SIDEWALK / 2 + 6, y: y + rng.range(-30, 30) });
      if (rng.chance(0.4)) trees.push({ x: cx - ROAD_WIDTH / 2 - SIDEWALK / 2 - 6, y: y + rng.range(-30, 30) });
    }
  }
  for (let x = 120; x < WORLD.width - 100; x += 220) {
    trees.push({ x: x + rng.range(-30, 30), y: BEACH_Y + 46 });
  }

  const world = {
    width: WORLD.width,
    height: WORLD.height,
    buildings,
    trees,
    props,
    special,
    park: park ? { x0: park.x0, y0: park.y0, x1: park.x1, y1: park.y1 } : null,
  };

  /** Does a circle of radius r at (x, y) hit a building or the world's edge? */
  world.blocked = function blocked(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  };

  /** A random point on a sidewalk (for pedestrians and cash pickups). */
  world.sidewalkPoint = function sidewalkPoint() {
    const road = rng.pick(ROADS_V);
    const along = rng.range(80, BEACH_Y - 40);
    const side = rng.chance(0.5) ? 1 : -1;
    return { x: road + side * (ROAD_WIDTH / 2 + SIDEWALK / 2), y: along };
  };

  /** A parking spot at a roadside, facing along the road. */
  world.parkedSpot = function parkedSpot() {
    const vertical = rng.chance(0.5);
    if (vertical) {
      const road = rng.pick(ROADS_V);
      const side = rng.chance(0.5) ? 1 : -1;
      return {
        x: road + side * (ROAD_WIDTH / 2 - 16),
        y: rng.range(120, BEACH_Y - 60),
        angle: side > 0 ? Math.PI / 2 : -Math.PI / 2,
      };
    }
    const road = rng.pick(ROADS_H);
    const side = rng.chance(0.5) ? 1 : -1;
    return {
      x: rng.range(120, WORLD.width - 120),
      y: road + side * (ROAD_WIDTH / 2 - 16),
      angle: side > 0 ? 0 : Math.PI,
    };
  };

  return world;
}
