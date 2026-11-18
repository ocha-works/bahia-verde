// city.js — Bahia Verde itself: the road grid, the blocks and buildings
// between them, the beach and the water, and the named places the story
// visits. The layout is generated from a fixed seed, so the city is the
// same on every visit and missions can safely point at real places.
//
// Roads are centre lines: avenues run north–south, streets east–west,
// and every crossing is a node in the traffic graph. Cars drive between
// neighbouring nodes; everything else (collision, spawning, the
// minimap) reads the same tables built here.

import { WORLD, COLORS } from './config.js';
import { makeRng } from './random.js';

export const AVENUES = [300, 940, 1580, 2220, 2860, 3500]; // centre x
export const STREETS = [300, 860, 1420, 1980, 2330]; // centre y; the last is the coastal road
export const AVENUE_HALF = 66;
export const STREET_HALF = 58;

const BUILDING_COLORS = [
  '#f2e3c6', '#eec9a3', '#e8b4b8', '#a8d5ba', '#9fc2e8', '#f6d186',
  '#d9c7ec', '#f4a988', '#bfe3dd', '#e6e6fa', '#ffd8a8', '#c5e0b4',
];
const ROOF_COLORS = ['#b5654d', '#8d6e63', '#6d8ea0', '#7a6a53', '#96604a', '#5d7a68'];

// Named places the missions and the minimap care about. Coordinates sit
// on open pavement inside real blocks or on the beach, clear of the
// roads and of the landmark buildings themselves — every one of them
// is a spot the player can actually stand on.
export const PLACES = {
  garage: { x: 620, y: 706, label: 'Vega Auto' },
  marina: { x: 520, y: 2505, label: 'Marina Azul' },
  hotel: { x: 1900, y: 2235, label: 'Hotel Coral' },
  market: { x: 1900, y: 1140, label: 'Mercado Central' },
  policeStation: { x: 3180, y: 712, label: 'BVPD Station' },
  hospital: { x: 2540, y: 1290, label: 'Hospital San Sol' },
  warehouse: { x: 3180, y: 2150, label: 'Almacén Sur' },
  chopShop: { x: 1180, y: 2245, label: 'Taller Fénix' },
  hideout: { x: 150, y: 2540, label: 'Beach Hideout' },
  plaza: { x: 1260, y: 1140, label: 'Plaza del Faro' },
};

export function buildCity(seed) {
  const rng = makeRng(seed);

  // Traffic graph: one node per crossing, neighbours along each road.
  const nodes = [];
  const nodeIndex = new Map();
  for (let r = 0; r < STREETS.length; r++) {
    for (let c = 0; c < AVENUES.length; c++) {
      const node = { x: AVENUES[c], y: STREETS[r], col: c, row: r, neighbors: [] };
      nodeIndex.set(`${c},${r}`, nodes.length);
      nodes.push(node);
    }
  }
  for (const node of nodes) {
    const { col, row } = node;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${col + dc},${row + dr}`;
      if (nodeIndex.has(key)) node.neighbors.push(nodes[nodeIndex.get(key)]);
    }
  }

  // Blocks: the rectangles of land between two avenues and two streets.
  // The row between the last street and the coastal road is the
  // beachfront row; below the coastal road is sand, then water.
  const blocks = [];
  for (let r = 0; r < STREETS.length - 1; r++) {
    for (let c = 0; c < AVENUES.length - 1; c++) {
      blocks.push({
        x: AVENUES[c] + AVENUE_HALF,
        y: STREETS[r] + STREET_HALF,
        w: AVENUES[c + 1] - AVENUES[c] - AVENUE_HALF * 2,
        h: STREETS[r + 1] - STREETS[r] - STREET_HALF * 2,
        col: c,
        row: r,
      });
    }
  }

  // Which blocks hold a named place (and so skip the random fill).
  const placeBlocks = new Map();
  const blockKeyAt = (x, y) => {
    for (const b of blocks) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return `${b.col},${b.row}`;
    }
    return null;
  };
  for (const [name, place] of Object.entries(PLACES)) {
    const key = blockKeyAt(place.x, place.y);
    if (key) placeBlocks.set(key, name);
  }

  const buildings = [];
  const props = [];
  const addBuilding = (x, y, w, h, opts = {}) => {
    const building = {
      x, y, w, h,
      height: opts.height ?? rng.range(12, 30),
      color: opts.color ?? rng.pick(BUILDING_COLORS),
      roof: opts.roof ?? rng.pick(ROOF_COLORS),
      name: opts.name ?? null,
      kind: opts.kind ?? 'block',
    };
    buildings.push(building);
    return building;
  };

  for (const block of blocks) {
    const key = `${block.col},${block.row}`;
    const placeName = placeBlocks.get(key);
    const inset = 26;
    const ix = block.x + inset;
    const iy = block.y + inset;
    const iw = block.w - inset * 2;
    const ih = block.h - inset * 2;

    if (placeName === 'market' || placeName === 'plaza') {
      // Open plaza: stalls and palms, no tower in the way.
      block.kind = 'plaza';
      for (let i = 0; i < 5; i++) {
        props.push({ kind: 'stall', x: ix + rng.range(30, iw - 30), y: iy + rng.range(30, ih - 30), color: rng.pick(BUILDING_COLORS) });
      }
      for (let i = 0; i < 6; i++) {
        props.push({ kind: 'palm', x: ix + rng.range(10, iw - 10), y: iy + rng.range(10, ih - 10) });
      }
      continue;
    }
    if (placeName === 'garage' || placeName === 'chopShop') {
      addBuilding(ix + iw * 0.12, iy + ih * 0.2, iw * 0.76, ih * 0.55, { height: 10, color: '#cfd8dc', roof: '#546e7a', name: PLACES[placeName].label, kind: 'garage' });
      continue;
    }
    if (placeName === 'policeStation') {
      addBuilding(ix + iw * 0.1, iy + ih * 0.15, iw * 0.8, ih * 0.6, { height: 16, color: '#b0bec5', roof: '#37474f', name: 'BVPD', kind: 'civic' });
      continue;
    }
    if (placeName === 'hospital') {
      addBuilding(ix + iw * 0.08, iy + ih * 0.12, iw * 0.84, ih * 0.66, { height: 22, color: '#f5f5f5', roof: '#90a4ae', name: 'Hospital San Sol', kind: 'civic' });
      continue;
    }
    if (placeName === 'hotel') {
      addBuilding(ix + iw * 0.15, iy + ih * 0.08, iw * 0.7, ih * 0.6, { height: 34, color: '#ffe0b2', roof: '#c96f4a', name: 'Hotel Coral', kind: 'hotel' });
      for (let i = 0; i < 4; i++) props.push({ kind: 'palm', x: ix + rng.range(6, iw - 6), y: iy + ih * 0.8 });
      continue;
    }
    if (placeName === 'warehouse') {
      addBuilding(ix + 6, iy + ih * 0.18, iw * 0.44, ih * 0.6, { height: 11, color: '#a1887f', roof: '#5d4037', name: 'Almacén Sur', kind: 'warehouse' });
      addBuilding(ix + iw * 0.54, iy + ih * 0.18, iw * 0.42, ih * 0.6, { height: 11, color: '#90a4ae', roof: '#455a64', kind: 'warehouse' });
      continue;
    }

    const roll = rng.next();
    if (roll < 0.14) {
      // A park block: lawn and palms, no buildings at all.
      block.kind = 'park';
      for (let i = 0; i < 9; i++) {
        props.push({ kind: rng.chance(0.6) ? 'palm' : 'tree', x: ix + rng.range(8, iw - 8), y: iy + rng.range(8, ih - 8) });
      }
      continue;
    }
    if (roll < 0.5) {
      // Four smaller buildings, one per quadrant.
      const qw = iw / 2 - 12;
      const qh = ih / 2 - 12;
      for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        addBuilding(ix + qx * (iw / 2) + 6, iy + qy * (ih / 2) + 6, qw, qh);
      }
    } else if (roll < 0.8) {
      // Two long buildings stacked.
      addBuilding(ix + 8, iy + 6, iw - 16, ih / 2 - 14);
      addBuilding(ix + 8, iy + ih / 2 + 8, iw - 16, ih / 2 - 14);
    } else {
      // One tower filling the block.
      addBuilding(ix + iw * 0.14, iy + ih * 0.1, iw * 0.72, ih * 0.8, { height: rng.range(26, 40) });
    }
    // Sidewalk palms on some blocks.
    if (rng.chance(0.5)) {
      props.push({ kind: 'palm', x: block.x + 12, y: block.y + 12 });
      props.push({ kind: 'palm', x: block.x + block.w - 12, y: block.y + block.h - 12 });
    }
  }

  // Beach dressing: palms and umbrellas scattered on the sand, lamps
  // along the coastal road, and the marina's dock reaching into the bay.
  for (let x = 120; x < WORLD.width - 80; x += rng.range(120, 260)) {
    props.push({ kind: 'palm', x, y: rng.range(WORLD.sandY + 30, WORLD.waterY - 60) });
    if (rng.chance(0.6)) props.push({ kind: 'umbrella', x: x + rng.range(20, 60), y: rng.range(WORLD.sandY + 40, WORLD.waterY - 80), color: rng.pick(BUILDING_COLORS) });
  }
  for (let x = 200; x < WORLD.width - 100; x += 190) {
    props.push({ kind: 'lamp', x: x - 8, y: 2330 - STREET_HALF - 10 });
    props.push({ kind: 'lamp', x: x + 8, y: 2330 + STREET_HALF + 10 });
  }
  props.push({ kind: 'dock', x: PLACES.marina.x - 90, y: WORLD.waterY - 10, w: 180, h: 190 });

  return { nodes, blocks, buildings, props, places: PLACES, rng };
}

// --- Spatial questions other modules ask ---------------------------------

export function isOnRoad(x, y) {
  if (y > 180 && y < 2450) {
    for (const ax of AVENUES) if (Math.abs(x - ax) <= AVENUE_HALF) return true;
  }
  if (x > 180 && x < 3620) {
    for (const sy of STREETS) if (Math.abs(y - sy) <= STREET_HALF) return true;
  }
  return false;
}

export function groundAt(x, y) {
  if (y >= WORLD.waterY) return 'water';
  if (y >= WORLD.sandY) return 'sand';
  return 'city';
}

export function buildingAt(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

// Resolve a circle against every building rect: push the centre out
// along the smaller penetration axis. Returns true if it collided.
export function collideBuildings(city, pos, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.y = ny + (dy / d) * radius;
      } else {
        // Centre is inside the rect: push out through the nearest face.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - radius;
        else if (min === right) pos.x = b.x + b.w + radius;
        else if (min === top) pos.y = b.y - radius;
        else pos.y = b.y + b.h + radius;
      }
    }
  }
  return hit;
}

export function clampToWorld(pos, margin = 20) {
  pos.x = Math.max(margin, Math.min(WORLD.width - margin, pos.x));
  pos.y = Math.max(margin, Math.min(WORLD.height - margin, pos.y));
}

// A random point on a road near (cx, cy): pick a node, walk a little way
// toward one of its neighbours. Used for traffic and police spawns.
export function roadPointNear(city, rng, cx, cy, minDist, maxDist) {
  for (let tries = 0; tries < 24; tries++) {
    const node = rng.pick(city.nodes);
    const d = Math.hypot(node.x - cx, node.y - cy);
    if (d < minDist || d > maxDist) continue;
    const next = rng.pick(node.neighbors);
    const t = rng.range(0.15, 0.85);
    return { x: node.x + (next.x - node.x) * t, y: node.y + (next.y - node.y) * t, node, next };
  }
  const node = rng.pick(city.nodes);
  return { x: node.x, y: node.y, node, next: node.neighbors[0] };
}

export function nodeNearest(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const node of city.nodes) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

export { COLORS };
