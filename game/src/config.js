// config.js — Bahia Verde's tuning knobs and palette, in one place.
// Every other module reads its numbers from here so the city's feel
// (speeds, distances, prices of crime) can be adjusted without hunting.

// World geometry, in pixels. The city is a grid of avenues and streets
// laid over a coastal shelf: sand and then water along the south edge.
export const WORLD = {
  width: 3840,
  height: 2880,
  waterY: 2640, // at and below this y the ground is open water
  sandY: 2400, // at and below this y (and above waterY) the ground is beach sand
};

// Player tuning.
export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 262,
  accel: 1500,
  maxHealth: 100,
  bustTime: 2.4, // seconds of standing still next to police before a bust
};

// Vehicle tuning. Speeds are pixels per second at the top end.
export const TRAFFIC = {
  cruiseSpeed: 148,
  laneOffset: 17, // right-hand traffic: distance from the centre line
  lookAhead: 72,
  safeGap: 58, // distance kept to the car in front
  maxCars: 26,
};

export const POLICE = {
  maxSpeedBase: 252,
  perStarSpeed: 9,
  spawnDistance: 620,
  despawnDistance: 1300,
  sightRange: 430,
};

// Wanted heat: crimes add heat, stars are ceil(heat / 50), capped at 5.
export const HEAT = {
  perStar: 50,
  max: 250,
  carTheft: 26,
  assault: 20,
  gunshot: 14,
  pedKilled: 60,
  policeHit: 50,
  officerKilled: 100,
  decayHidden: 4.2, // per second while no officer can see the player
  decaySeen: 0.7, // per second while watched
};

// The sun-soaked palette. Warm pavement, teal water, pastel blocks.
export const COLORS = {
  grass: '#79a85b',
  grassDark: '#6b9a50',
  pavement: '#cbb98f',
  sidewalk: '#ded3ae',
  road: '#4a4a52',
  roadEdge: '#f3e9c8',
  laneMark: '#e8e3ce',
  crosswalk: '#d8d8d8',
  sand: '#ecd28f',
  sandDark: '#e0c078',
  water: '#1f7f96',
  waterDeep: '#166a84',
  waterFoam: '#bfe8dd',
  playerShirt: '#ffcf3f',
  playerPants: '#274156',
  policeCar: '#20303e',
  policeCarLight: '#f4f6f8',
  marker: '#ffd23f',
  danger: '#ef476f',
  cash: '#8ee08a',
};

export const SAVE_KEY = 'bahia-verde-save-v1';
