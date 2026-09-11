import { FIXED_STEP } from './game.js';

export function startGameLoop(game) {
  const frame = (now) => {
    const wallDt = Math.max(0, (now - game.last) / 1000 || 0);
    const dt = Math.min(.05, wallDt);
    game.last = now;
    if (game.state === 'playing') {
      game.controls?.flush();
      game.elapsed += wallDt - dt;
      game.accum += dt;
      let steps = 0;
      while (game.accum >= FIXED_STEP && steps < 8 && game.state === 'playing') {
        game.update(FIXED_STEP);
        game.accum -= FIXED_STEP;
        steps++;
      }
      if (steps >= 8) game.accum = 0;
    } else {
      game.accum = 0;
    }
    game.sound.tick(dt, { playing: game.state === 'playing', level: game.level });
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
