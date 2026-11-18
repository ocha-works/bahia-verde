// scenes.js — staged, deterministic set-pieces for the screenshots
// (and for anyone who wants to see the game's systems at a glance).
// Opening game/index.html with ?scene=chase (or onfoot, driving,
// mission) skips the title, builds the same seeded city, places the
// actors mid-action, and hands the player car an autopilot so the
// wheels are turned and the chase is moving when the shutter falls.
// The scenes are the game's real simulation — nothing is faked or
// composited; the simulation just starts further into the story.

import { PLACES } from './city.js';
import { makeVehicle } from './vehicles.js';
import { makePedestrian } from './pedestrians.js';

function lanePoint(x, y) {
  return { x, y };
}

function stageMission(game, title, step) {
  const ms = game.missions;
  ms.phase = 'active';
  ms.current = { title, reward: 0 };
  ms.steps = [step];
  ms.stepIdx = 0;
}

function northboundTraffic(game, kind, x, y, fromNode, toNode, color) {
  const car = makeVehicle(kind, x, y, -Math.PI / 2, { color, driver: 'traffic', from: fromNode, to: toNode });
  car.speed = 120;
  game.vehicles.push(car);
  return car;
}

function nodeAt(game, col, row) {
  return game.city.nodes.find((n) => n.col === col && n.row === row);
}

const SCENES = {
  // The cover: a three-star chase up the central avenue — police on
  // the bumper, traffic ahead, the minimap lit up, and the objective
  // banner telling the story.
  chase(game) {
    const p = game.player;
    const car = makeVehicle('coupe', 1597, 1150, -Math.PI / 2, { color: '#d63031', driver: 'player' });
    car.speed = 215;
    game.vehicles.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    const cop1 = makeVehicle('police', 1597, 1312, -Math.PI / 2, { color: '#20303e', driver: 'police' });
    cop1.speed = 228;
    const cop2 = makeVehicle('police', 1563, 1452, -Math.PI / 2, { color: '#20303e', driver: 'police' });
    cop2.speed = 218;
    game.vehicles.push(cop1, cop2);
    game.wanted.heat = 132; // three stars
    const sedan = northboundTraffic(game, 'sedan', 1563, 470, nodeAt(game, 2, 1), nodeAt(game, 2, 0), '#3498db');
    sedan.speed = 150; // far enough ahead that the chase is still a chase
    const crosser = makeVehicle('van', 860, 1437, 0, { color: '#ecf0f1', driver: 'traffic', from: nodeAt(game, 1, 2), to: nodeAt(game, 2, 2) });
    crosser.speed = 100;
    game.vehicles.push(crosser);
    stageMission(game, 'Hot Van', {
      type: 'goto', x: PLACES.chopShop.x, y: PLACES.chopShop.y, r: 64,
      text: 'Lose the BVPD, then reach Taller Fénix',
    });
    game.autopilot = (g, entity) => {
      const target = lanePoint(1597, entity.y - 420);
      let diff = Math.atan2(target.y - entity.y, target.x - entity.x) - entity.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return { throttle: 0.92, steer: Math.max(-1, Math.min(1, diff * 1.8)) };
    };
    // A short warm-up only: any longer and the BVPD wins the cover shot.
    game.warmupSteps = 30;
  },

  // On foot on the beachfront promenade: palms, strollers, the hotel,
  // and the whole city waiting. The offer banner points at the first job.
  onfoot(game) {
    const p = game.player;
    p.x = 1900;
    p.y = 2248;
    p.angle = 0.85;
    const spots = [
      [1820, 2290], [1995, 2265], [2050, 2330], [1760, 2200],
      [2150, 2300], [1690, 2335], [2240, 2240], [1960, 2180],
    ];
    for (const [x, y] of spots) {
      const ped = makePedestrian(game.rng, x, y);
      ped.target = { x: x + game.rng.range(-160, 160), y: y + game.rng.range(-60, 60) };
      game.pedestrians.push(ped);
    }
    for (const [x, angle] of [[1650, 0], [2280, Math.PI], [1420, 0]]) {
      const parked = makeVehicle(game.rng.pick(['coupe', 'sedan', 'hatch']), x, 2374, angle, { color: '#f6d186', driver: 'parked' });
      game.vehicles.push(parked);
    }
  },

  // Driving the Marina Run: mid-intersection, traffic on every side,
  // the delivery timer counting down over the objective.
  driving(game) {
    const p = game.player;
    const car = makeVehicle('sedan', 2045, 1437, 0, { color: '#2471a3', driver: 'player' });
    car.speed = 138;
    game.vehicles.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    const ahead = makeVehicle('hatch', 2470, 1437, 0, { color: '#e67e22', driver: 'traffic', from: nodeAt(game, 3, 2), to: nodeAt(game, 4, 2) });
    ahead.speed = 118;
    game.vehicles.push(ahead);
    const oncoming = makeVehicle('coupe', 2650, 1403, Math.PI, { color: '#9b59b6', driver: 'traffic', from: nodeAt(game, 4, 2), to: nodeAt(game, 3, 2) });
    oncoming.speed = 124;
    game.vehicles.push(oncoming);
    northboundTraffic(game, 'van', 2237, 1130, nodeAt(game, 3, 2), nodeAt(game, 3, 1), '#95a5a6');
    stageMission(game, 'Marina Run', {
      type: 'timerGoto', x: PLACES.hotel.x, y: PLACES.hotel.y, r: 62, seconds: 150,
      text: 'Deliver the crate to Hotel Coral',
    });
    game.missions.timer = 97;
    game.autopilot = (g, entity) => {
      const target = lanePoint(entity.x + 420, 1437);
      let diff = Math.atan2(target.y - entity.y, target.x - entity.x) - entity.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return { throttle: 0.85, steer: Math.max(-1, Math.min(1, diff * 1.8)) };
    };
  },

  // Collections, mid-argument: Nico, pistol in hand, facing Rico and
  // his friend while a bystander decides to be somewhere else.
  mission(game) {
    const p = game.player;
    p.x = 1288;
    p.y = 1186;
    p.angle = -0.5;
    p.hasPistol = true;
    p.weapon = 'pistol';
    p.ammo = 9;
    p.reserveAmmo = 24;
    const rico = makePedestrian(game.rng, 1372, 1148, { hostile: true, health: 46, name: 'Rico' });
    rico.state = 'hostile';
    rico.holdPosition = true;
    const friend = makePedestrian(game.rng, 1400, 1212, { hostile: true, health: 46 });
    friend.state = 'hostile';
    friend.holdPosition = true;
    const bystander = makePedestrian(game.rng, 1236, 1108);
    bystander.state = 'flee';
    bystander.fleeFrom = { x: p.x, y: p.y };
    game.pedestrians.push(rico, friend, bystander);
    game.mouseWorldOverride = { x: 1340, y: 1170 };
    stageMission(game, 'Collections', {
      type: 'fight', peds: [rico, friend], cash: 150,
      text: 'Collect what Rico owes',
    });
    game.autopilot = () => ({ x: 0, y: 0 });
  },
};

export function setupScene(game, name) {
  const scene = SCENES[name];
  if (!scene) return false;
  scene(game);
  return true;
}

export const SCENE_NAMES = Object.keys(SCENES);
