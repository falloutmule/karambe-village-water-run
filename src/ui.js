import { DEV_MENU, LEVELS, formatTime } from './game.js';

const $ = (id) => document.getElementById(id);

export function createGameUI(game) {
  const overlay = $('overlay');
  const title = $('overlayTitle');
  const subtitle = $('overlaySubtitle');
  const body = $('overlayBody');
  const statsBox = $('statsBox');
  const levelSelectBox = $('levelSelectBox');
  const primary = $('primaryBtn');
  const secondary = $('secondaryBtn');
  const soundBtn = $('soundBtn');
  const volumeSlider = $('volumeSlider');
  const volumeValue = $('volumeValue');
  const downloadBtn = $('downloadBtn');
  const installBtn = $('installBtn');
  const offlineStatus = $('offlineStatus');
  const app = $('app');
  const menuBtn = $('menuBtn');
  const gameStatus = $('gameStatus');
  let primaryAction = () => {}, secondaryAction = () => {};
  let restoreFocus = null;
  function renderSoundSettings() {
    const percent = Math.round(game.sound.volume * 100);
    soundBtn.textContent = `SOUND: ${game.sound.enabled ? 'ON' : 'OFF'}`;
    volumeSlider.value = String(percent);
    volumeSlider.setAttribute('aria-valuetext', `${percent} percent`);
    volumeValue.textContent = `${percent}%`;
  }
  primary.addEventListener('click', () => { game.sound.unlock(); game.sound.menu(); primaryAction(); });
  secondary.addEventListener('click', () => { game.sound.unlock(); game.sound.menu(); secondaryAction(); });

  function renderLevelSelect() {
    if (!game.canSelectLevels()) {
      levelSelectBox.replaceChildren();
      levelSelectBox.classList.add('hidden');
      return false;
    }
    levelSelectBox.classList.remove('hidden');
    levelSelectBox.setAttribute('aria-label', DEV_MENU ? 'Development level menu' : 'Level select');
    const heading = document.createElement('div');
    heading.className = 'level-select-title';
    heading.textContent = DEV_MENU ? 'DEV MENU — LEVEL ACCESS' : 'CHOOSE A LEVEL';
    const grid = document.createElement('div');
    grid.className = 'level-select-grid';
    levelSelectBox.replaceChildren(heading, grid);
    for (const level of LEVELS) {
      const button = document.createElement('button');
      button.className = 'level-pick';
      const best = game.bestTimes[level.number - 1];
      const strong = document.createElement('strong');
      strong.append(`L${level.number}`, document.createElement('br'), level.name);
      const record = document.createElement('span');
      record.textContent = best ? formatTime(best) : 'NO BEST';
      button.replaceChildren(strong, record);
      button.addEventListener('click', () => {
        game.sound.unlock();
        game.sound.menu();
        closeOverlay();
        game.startLevel(level.number);
      });
      grid.append(button);
    }
    return true;
  }

  function renderStats(rows) {
    const nodes = [];
    for (const [label, value] of rows) {
      const name = document.createElement('span');
      const result = document.createElement('strong');
      name.textContent = label;
      result.textContent = value;
      nodes.push(name, result);
    }
    statsBox.replaceChildren(...nodes);
  }

  function showOverlay(mode) {
    if (!overlay.classList.contains('open')) restoreFocus = document.activeElement;
    overlay.classList.add('open');
    app.inert = true;
    overlay.setAttribute('aria-hidden', 'false');
    statsBox.classList.add('hidden');
    secondary.classList.add('hidden');
    body.classList.add('hidden');
    secondary.removeAttribute('aria-controls');
    secondary.removeAttribute('aria-expanded');
    levelSelectBox.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    installBtn.classList.add('hidden');
    if (mode === 'start') {
      title.textContent = DEV_MENU ? 'DEV MENU — Karambe Village Water Run' : 'Karambe Village Water Run';
      const canSelect = renderLevelSelect();
      subtitle.textContent = DEV_MENU ? 'Development access: choose any level. Progress and best times are not saved.' : canSelect ? 'Choose a level or race the complete three-level run.' : 'Complete the three-level run to unlock Level Select.';
      primary.textContent = 'START FULL RUN';
      primaryAction = () => { closeOverlay(); game.start(); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'HOW TO PLAY';
      secondary.setAttribute('aria-controls', 'overlayBody');
      secondary.setAttribute('aria-expanded', 'false');
      secondaryAction = () => {
        body.classList.toggle('hidden');
        const expanded = !body.classList.contains('hidden');
        secondary.textContent = expanded ? 'HIDE HELP' : 'HOW TO PLAY';
        secondary.setAttribute('aria-expanded', String(expanded));
      };
      if (location.protocol !== 'file:') downloadBtn.classList.remove('hidden');
      installBtn.classList.remove('hidden');
    } else if (mode === 'pause') {
      title.textContent = `Paused — Level ${game.level}`;
      subtitle.textContent = `Stopwatch paused at ${formatTime(game.elapsed)}.`;
      renderLevelSelect();
      primary.textContent = 'RESUME';
      primaryAction = () => { closeOverlay(); game.resume(); };
      secondary.classList.remove('hidden');
      secondary.textContent = game.runMode === 'single' ? `RESTART LEVEL ${game.level}` : 'RESTART FULL RUN';
      secondaryAction = () => {
        closeOverlay();
        if (game.runMode === 'single') game.startLevel(game.level); else game.start();
      };
    } else if (mode === 'singleComplete') {
      const result = game.levelResults[game.level - 1];
      title.textContent = `Level ${game.level} Clear`;
      subtitle.textContent = `Three cans delivered in ${formatTime(result.time)}.`;
      renderStats([['Level time', formatTime(result.time)], ['Can 1', formatTime(result.splits[0])], ['Can 2', formatTime(result.splits[1])], ['Can 3', formatTime(result.splits[2])], ['Retries', String(result.retries)], ['Best', formatTime(game.bestTimes[game.level - 1])]]);
      statsBox.classList.remove('hidden');
      renderLevelSelect();
      primary.textContent = `RUN LEVEL ${game.level} AGAIN`;
      primaryAction = () => { closeOverlay(); game.startLevel(game.level); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'START FULL RUN';
      secondaryAction = () => { closeOverlay(); game.start(); };
    } else if (mode === 'levelComplete') {
      const next = LEVELS[game.level];
      const result = game.levelResults[game.level - 1];
      title.textContent = `Level ${game.level} Clear`;
      subtitle.textContent = `Three cans delivered in ${formatTime(result.time)}.`;
      renderStats([['Level time', formatTime(result.time)], ['Can 1', formatTime(result.splits[0])], ['Can 2', formatTime(result.splits[1])], ['Can 3', formatTime(result.splits[2])], ['Retries', String(result.retries)], ['Best', formatTime(game.bestTimes[game.level - 1])], ['Next', `${game.level + 1}: ${next.name}`]]);
      statsBox.classList.remove('hidden');
      primary.textContent = `START LEVEL ${game.level + 1}`;
      primaryAction = () => { closeOverlay(); game.advanceLevel(); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'RESTART FULL RUN';
      secondaryAction = () => { closeOverlay(); game.start(); };
    } else if (mode === 'over') {
      const l1 = game.levelResults[0];
      const l2 = game.levelResults[1];
      const l3 = game.levelResults[2];
      title.textContent = 'Water Run Complete';
      subtitle.textContent = `Nine cans delivered in ${formatTime(game.totalTime)}.`;
      renderStats([['Level 1', formatTime(l1?.time)], ['Level 2', formatTime(l2?.time)], ['Level 3', formatTime(l3?.time)], ['Total time', formatTime(game.totalTime)], ['Total retries', String(game.stats.retries)], ['Rocks blocked', String(game.stats.rocks)], ['Snakes squashed', String(game.stats.snakes)], ['Best total', formatTime(game.bestTotal)]]);
      statsBox.classList.remove('hidden');
      renderLevelSelect();
      primary.textContent = 'RUN ALL LEVELS AGAIN';
      primaryAction = () => { closeOverlay(); game.start(); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'HOW TO PLAY';
      secondaryAction = () => showOverlay('start');
    }
    renderSoundSettings();
    requestAnimationFrame(() => primary.focus({ preventScroll: true }));
  }

  function closeOverlay() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    app.inert = false;
    const target = restoreFocus && app.contains(restoreFocus) ? restoreFocus : menuBtn;
    restoreFocus = null;
    target.focus({ preventScroll: true });
  }

  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button, input, a[href]')].filter(element => !element.disabled && !element.closest('.hidden') && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  soundBtn.addEventListener('click', () => {
    game.sound.setEnabled(!game.sound.enabled);
    if (game.sound.enabled) game.sound.unlock();
    renderSoundSettings();
  });
  volumeSlider.addEventListener('input', () => {
    game.sound.setVolume(Number(volumeSlider.value) / 100);
    renderSoundSettings();
  });
  volumeSlider.addEventListener('change', () => {
    if (!game.sound.enabled) return;
    game.sound.unlock();
    game.sound.controlPress();
  });

  installBtn.addEventListener('click', () => {
    subtitle.textContent = 'Chrome menu ⋮ → Add to Home screen. Download Offline Game below is the no-connection copy.';
  });
  if (location.protocol === 'file:') offlineStatus.classList.remove('hidden');

  menuBtn.addEventListener('click', () => {
    game.sound.unlock();
    if (game.state === 'playing') { game.pause(); showOverlay('pause'); }
    else if (game.state === 'paused') showOverlay('pause');
    else if (game.state === 'between') showOverlay('levelComplete');
    else if (game.state === 'singleComplete') showOverlay('singleComplete');
    else if (game.state === 'over') showOverlay('over');
    else if (game.state === 'clearing') return;
    else showOverlay('start');
    game.sound.menu();
  });

  return {
    showOverlay,
    closeOverlay,
    announce(text) { gameStatus.textContent = ''; requestAnimationFrame(() => { gameStatus.textContent = text; }); }
  };
}
