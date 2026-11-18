// save.js — progress persistence in localStorage: which jobs Nico has
// finished, his cash, whether he carries the pistol, and where he was
// standing. Saving happens when a mission ends and when he is busted
// or wasted, so a closed tab never costs more than a drive across town.

import { SAVE_KEY } from './config.js';

export function saveGame(game) {
  try {
    const data = {
      missionsIndex: game.missions.index,
      storyComplete: game.missions.storyComplete,
      cash: Math.round(game.player.cash),
      hasPistol: game.player.hasPistol,
      reserveAmmo: game.player.reserveAmmo,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full store: the game simply runs unsaved.
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || !('missionsIndex' in data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
