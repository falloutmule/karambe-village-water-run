import { createGameControls } from './controls.ts';
import { SoundBank } from './audio.js';
import { BUILD_ID, DEV_ACCESS, LEVELS, SAVE_VERSION, Game } from './game.js';
import { startGameLoop } from './loop.js';
import { Renderer } from './renderer.js';
import { createRecordStore } from './storage.js';
import { createGameUI } from './ui.js';

const $ = (id) => document.getElementById(id);
const game = new Game({
  sound: new SoundBank(),
  records: createRecordStore(!DEV_ACCESS, LEVELS.length)
});
game.attachRenderer(new Renderer($('game'), game));
const ui = createGameUI(game);
const controls = createGameControls(game);
game.controls = controls;
game.cancelControlTouches = reason => controls.releaseAll(reason);
game.showOverlay = ui.showOverlay;
game.onScore = text => { $('score').textContent = text; };
game.onStatus = ui.announce;
game.setScoreText();

window.CR = { buildId: BUILD_ID, saveVersion: SAVE_VERSION, dev: DEV_ACCESS };
if (DEV_ACCESS) window.CR.game = game;
if (DEV_ACCESS) window.CR.controls = controls;
window.CR.runFullSelfCheck = () => {
  const state = () => JSON.stringify({ player: game.player, can: game.can, rocks: game.rocks, snakes: game.snakes, elapsed: game.elapsed, cans: game.levelCans, progress: game.tripProgress });
  const before = state();
  game.render();
  const contacts = controls.read().mobile.activePointers;
  const checks = {
    renderReadOnly: before === state(),
    finitePosition: Number.isFinite(game.player.x) && Number.isFinite(game.player.y),
    validLevel: game.level >= 1 && game.level <= 3,
    validCheckpoint: game.levelCans >= 0 && game.levelCans <= 3 && game.elapsed >= 0,
    uniqueContacts: new Set(contacts.map(pointer => pointer.identifier)).size === contacts.length,
    uniqueControls: new Set(contacts.map(pointer => pointer.controlId)).size === contacts.length,
    standalone: !document.querySelector('script[src],link[rel="stylesheet"]')
  };
  return { pass: Object.values(checks).every(Boolean), buildId: BUILD_ID, checks };
};

const pauseWhenHidden = () => {
  controls.releaseAll('hidden');
  if (game.state === 'playing') { game.pause(); ui.showOverlay('pause'); }
};
window.addEventListener('blur', pauseWhenHidden);
window.addEventListener('pagehide', pauseWhenHidden);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenHidden(); });
window.addEventListener('resize', () => { game.resize(); if (innerWidth > innerHeight && innerHeight < 520) pauseWhenHidden(); });
new ResizeObserver(() => game.resize()).observe($('stage'));
startGameLoop(game);
ui.showOverlay('start');
