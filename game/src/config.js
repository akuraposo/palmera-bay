// Palmera Bay — every tuning number and colour in one place.
// The city is a fixed 3400x2650 world; the camera follows the player and the
// renderer scales the view to the window, so no rule below depends on the
// screen size. All names, places and characters are original.

export const STEP = 1 / 60;

export const WORLD = { width: 3400, height: 2650 };

/** Road centrelines; roads are ROAD_WIDTH wide with a sidewalk each side. */
export const ROADS_V = [200, 700, 1200, 1700, 2200, 2700, 3200];
export const ROADS_H = [200, 650, 1100, 1550, 2000, 2400];
export const ROAD_WIDTH = 116;
export const SIDEWALK = 26;

/** The beach band and the water beyond it, along the south edge. */
export const BEACH_Y = 2450;

export const PLAYER = {
  radius: 13,
  walk: 250,
  run: 360,
  health: 100,
  punchRange: 46,
  punchDamage: 34,
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmo: 12,
  maxAmmo: 48,
};

export const CAR = {
  length: 64,
  width: 30,
  // Per-type tuning: acceleration, top speed, grip (steering) and toughness.
  types: {
    sedan: { accel: 420, top: 520, grip: 2.6, hp: 100, color: '#c94f43' },
    taxi: { accel: 400, top: 500, grip: 2.6, hp: 100, color: '#e8b93c' },
    sport: { accel: 640, top: 760, grip: 3.4, hp: 80, color: '#e8c832' },
    van: { accel: 320, top: 430, grip: 2.2, hp: 130, color: '#7d8aa0' },
    truck: { accel: 300, top: 400, grip: 2.0, hp: 160, color: '#5d7d5a' },
    police: { accel: 560, top: 640, grip: 3.1, hp: 120, color: '#2f6fb2' },
  },
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 34;
export const PARKED_COUNT = 22;

export const WANTED = {
  max: 5,
  /** Seconds of no crime and no cop in sight before one star fades. */
  decaySeconds: 22,
  /** How close a cop must be to keep the heat on. */
  sightRange: 520,
};

export const PICKUP_VALUE_MIN = 25;
export const PICKUP_VALUE_MAX = 120;
export const PICKUP_COUNT = 10;

export const DAY_LENGTH = 240;

export const PALETTE = {
  grass: '#7fae62',
  parkGrass: '#69a355',
  sidewalk: '#cbb98f',
  road: '#3c3f46',
  roadLine: '#e8d27a',
  sand: '#e3cd96',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  buildingRoof: '#b0705a',
  buildingWall: '#8a5a48',
  text: '#f5efe2',
  muted: '#c9bfa8',
  panel: 'rgba(20, 24, 34, 0.82)',
  accent: '#ffcf3f',
  police: '#4f8ff0',
  danger: '#e5534b',
  health: '#58c96b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, missions, best) is kept between visits. */
export const SAVE_KEY = 'palmera-bay.save.v1';
