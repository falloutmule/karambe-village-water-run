
(() => {
  'use strict';
  // SECTION constitution: INPUT -> ACTIONS -> SIMULATION -> RENDER.
  // Rendering never mutates gameplay or save state. Canonical source; generated index.html.
  // SAVE_VERSION changes require migration. No eval, dynamic Function, inline handlers or external runtime dependencies.
  const BUILD_ID = 'karambe-completion2';
  const SAVE_VERSION = 1;

  const WORLD_W = 480;
  const WORLD_H = 860;
  const CANS_PER_LEVEL = 3;
  const BUILD_LEVEL_SELECT = new URLSearchParams(location.search).get('dev') === '1' && (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname));
  const ROCK_TOP_EXIT_X = 378;
  const FIXED_STEP = 1 / 120;
  const LEVELS = [
    { number: 1, name: 'WATER RUN', rocks: false, snakes: false },
    { number: 2, name: 'ROCKS', rocks: true, snakes: false },
    { number: 3, name: 'ROCKS + SNAKES', rocks: true, snakes: true }
  ];
  const ROCK_PATTERN = [
    { delay: 1.18, target: 270 },
    { delay: .92, target: 150 },
    { delay: .72, target: 305 },
    { delay: 1.04, target: 205 },
    { delay: .62, target: 245 },
    { delay: 1.16, target: 120 }
  ];
  const BRIDGE_X1 = 205;
  const BRIDGE_X2 = 315;
  const BOTTOM_PLATFORM = 5;
  const UPPER_BYPASS = 3;
  const LOWER_BYPASS = 4;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
  const rand = (a, b) => a + Math.random() * (b - a);
  const formatTime = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const centis = Math.floor((safe - Math.floor(safe)) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  };

  function mixColor(a, b, t) {
    const pa = a.match(/\d+/g).map(Number);
    const pb = b.match(/\d+/g).map(Number);
    return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
  }

  /* AUDIO_MODULE */
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.sound = new SoundBank();
      this.state = 'ready';
      this.last = performance.now();
      this.accum = 0;
      this.input = { left: false, right: false };
      this.canPress = null;
      this.cancelControlTouches = null;
      this.platforms = [
        { x1: 30, y1: 168, x2: 420, y2: 208, downhill: 1 },
        { x1: 25, y1: 338, x2: 420, y2: 298, downhill: -1 },
        { x1: 75, y1: 447, x2: 420, y2: 487, downhill: 1 },
        { x1: 25, y1: 578, x2: 385, y2: 538, downhill: -1 },
        { x1: 35, y1: 652, x2: 385, y2: 692, downhill: 1 },
        { x1: 35, y1: 792, x2: 420, y2: 747, downhill: -1 }
      ];
      try {
        const stored = JSON.parse(localStorage.getItem('karambe-water-run-best-times') || '[]');
        this.bestTimes = Array.isArray(stored) ? stored.slice(0, LEVELS.length) : [];
        this.bestTotal = Number(localStorage.getItem('karambe-water-run-best-total') || 0);
        this.fullRunCompleted = localStorage.getItem('karambe-water-run-full-clear') === '1';
      } catch {
        this.bestTimes = [];
        this.bestTotal = 0;
        this.fullRunCompleted = false;
      }
      this.runMode = 'full';
      this.resize();
      this.reset();
      requestAnimationFrame((t) => this.frame(t));
    }

    reset() {
      this.level = 1;
      this.score = 0;
      this.levelResults = [];
      this.totalTime = 0;
      this.stats = { rocks: 0, snakes: 0, falls: 0, hits: 0, deliveries: 0, retries: 0 };
      this.resetLevel();
    }

    resetLevel() {
      this.levelCans = 0;
      this.elapsed = 0;
      this.levelFinishTime = 0;
      this.canStartElapsed = 0;
      this.canSplits = [];
      this.levelRetries = 0;
      this.tripProgress = 0;
      this.respawning = false;
      this.respawnTimer = 0;
      this.particles = [];
      this.scoreFlash = 0;
      this.accum = 0;
      this.resetCurrentCan(false, `LEVEL ${this.level} — ${this.levelConfig().name}`);
    }

    resetCurrentCan(fromHit = false, message = '') {
      this.cancelControlTouches?.('current-can-reset');
      this.attemptVersion = (this.attemptVersion || 0) + 1;
      this.player = {
        x: 62,
        y: this.surfaceY(0, 62),
        prevY: 0,
        vx: 0,
        vy: 0,
        platform: 0,
        grounded: true,
        facing: 1,
        climbing: null,
        stun: 0,
        invuln: 0,
        blocking: false,
        fullCanWarning: 0,
        bridgeWarning: 0,
        fallDrop: false,
        step: 0,
        dead: false,
        jumpBuffer: 0,
        coyote: .1,
        connectorLock: null
      };
      this.can = { held: true, full: false, platform: 0, x: 62, fill: 0, pour: 0, vx: 0, dropLift: 0, hitFlash: 0 };
      this.bridge = { state: 'solid', timer: 0, shake: 0 };
      this.resetHazards();
      this.canPress = null;
      this.input.left = false;
      this.input.right = false;
      this.tripProgress = 0;
      this.respawning = false;
      this.respawnTimer = 0;
      this.message = message || (fromHit ? `TRY AGAIN — CAN ${this.levelCans + 1} OF ${CANS_PER_LEVEL}` : '');
      this.messageTimer = this.message ? 1.25 : 0;
      this.setScoreText();
    }

    resetHazards() {
      this.snakes = [
        { platform: 1, x: 235, startX: 235, min: 170, max: 295, dir: 1, startDir: 1, speed: 22, squashed: false, respawn: 0, respawnDelay: 5.0, cooldown: 0, phase: 0 },
        { platform: LOWER_BYPASS, x: 235, startX: 235, min: 165, max: 305, dir: -1, startDir: -1, speed: 25, squashed: false, respawn: 0, respawnDelay: 5.4, cooldown: 0, phase: 1.8 }
      ];
      this.rocks = [];
      this.chimp = { phase: 'idle', timer: ROCK_PATTERN[0].delay, patternIndex: 0, targetX: ROCK_PATTERN[0].target, blink: 0 };
    }

    levelConfig() {
      return LEVELS[this.level - 1];
    }

    hasRocks() {
      return this.levelConfig().rocks;
    }

    hasSnakes() {
      return this.levelConfig().snakes;
    }

    canSelectLevels() {
      return this.fullRunCompleted || BUILD_LEVEL_SELECT;
    }

    start() {
      this.runMode = 'full';
      this.reset();
      this.state = 'playing';
      this.last = performance.now();
      this.sound.unlock();
    }

    startLevel(levelNumber) {
      if (!this.canSelectLevels()) return;
      const selected = clamp(Math.round(levelNumber), 1, LEVELS.length);
      this.runMode = 'single';
      this.level = selected;
      this.score = 0;
      this.levelResults = [];
      this.totalTime = 0;
      this.stats = { rocks: 0, snakes: 0, falls: 0, hits: 0, deliveries: 0, retries: 0 };
      this.resetLevel();
      this.state = 'playing';
      this.last = performance.now();
      this.sound.unlock();
    }

    advanceLevel() {
      if (this.level >= LEVELS.length) return;
      this.level++;
      this.resetLevel();
      this.state = 'playing';
      this.last = performance.now();
      this.sound.unlock();
    }

    pause() {
      if (this.state === 'playing') {
        this.cancelControlTouches?.('pause');
        this.state = 'paused';
        this.sound.tick(0, { playing: false, level: this.level });
        this.input.left = this.input.right = false;
        this.player.blocking = false;
        this.canPress = null;
      }
    }

    resume() {
      if (this.state === 'paused') {
        this.state = 'playing';
        this.last = performance.now();
        this.accum = 0;
        this.sound.unlock();
      }
    }

    completeLevel() {
      if (this.state !== 'playing') return;
      this.cancelControlTouches?.('level-complete');
      this.levelFinishTime = this.elapsed;
      this.tripProgress = 0;
      this.state = 'clearing';
      this.sound.tick(0, { playing: false, level: this.level });
      this.input.left = this.input.right = false;
      this.player.blocking = false;
      this.canPress = null;
      this.sound.clear();
      setTimeout(() => this.finishLevel(), 420);
    }

    finishLevel() {
      const time = this.levelFinishTime || this.elapsed;
      const result = {
        level: this.level,
        time,
        splits: this.canSplits.slice(0, CANS_PER_LEVEL),
        retries: this.levelRetries
      };
      this.levelResults[this.level - 1] = result;
      const index = this.level - 1;
      if (!this.bestTimes[index] || time < this.bestTimes[index]) {
        this.bestTimes[index] = time;
        try { if (!BUILD_LEVEL_SELECT) localStorage.setItem('karambe-water-run-best-times', JSON.stringify(this.bestTimes)); } catch {}
      }
      if (this.runMode === 'single') {
        this.state = 'singleComplete';
        showOverlay('singleComplete');
        return;
      }
      if (this.level < LEVELS.length) {
        this.state = 'between';
        showOverlay('levelComplete');
      } else {
        this.state = 'over';
        this.totalTime = this.levelResults.reduce((sum, item) => sum + (item?.time || 0), 0);
        if (!this.bestTotal || this.totalTime < this.bestTotal) {
          this.bestTotal = this.totalTime;
          try { if (!BUILD_LEVEL_SELECT) localStorage.setItem('karambe-water-run-best-total', String(this.bestTotal)); } catch {}
        }
        this.fullRunCompleted = true;
        try { if (!BUILD_LEVEL_SELECT) localStorage.setItem('karambe-water-run-full-clear', '1'); } catch {}
        showOverlay('over');
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      this.scaleX = this.canvas.width / WORLD_W;
      this.scaleY = this.canvas.height / WORLD_H;
    }

    surfaceY(index, x) {
      const p = this.platforms[index];
      const t = clamp((x - p.x1) / (p.x2 - p.x1), 0, 1);
      return lerp(p.y1, p.y2, t);
    }

    bridgeIsOpenAt(x) {
      return this.bridge.state === 'collapsed' && x > BRIDGE_X1 && x < BRIDGE_X2;
    }

    frame(now) {
      const wallDt = Math.max(0, (now - this.last) / 1000 || 0);
      const dt = Math.min(.05, wallDt);
      this.last = now;
      if (this.state === 'playing') {
        this.elapsed += wallDt - dt; // Stopwatch retains time even when simulation catches up conservatively.
        this.accum += dt;
        let steps = 0;
        while (this.accum >= FIXED_STEP && steps < 8 && this.state === 'playing') {
          this.update(FIXED_STEP);
          this.accum -= FIXED_STEP;
          steps++;
        }
        if (steps >= 8) this.accum = 0;
      } else {
        this.accum = 0;
      }
      this.sound.tick(dt, { playing: this.state === 'playing', level: this.level });
      this.render();
      requestAnimationFrame((t) => this.frame(t));
    }

    update(dt) {
      this.controls?.flush();
      const attempt = this.attemptVersion;
      this.elapsed += dt;
      this.updateMessage(dt);
      if (this.respawning) {
        this.respawnTimer -= dt;
        this.updateParticles(dt);
        if (this.respawnTimer <= 0) {
          this.resetCurrentCan(true, `TRY AGAIN — CAN ${this.levelCans + 1} OF ${CANS_PER_LEVEL}`);
        }
        return;
      }
      if (this.hasRocks()) this.updateChimp(dt);
      else this.chimp.blink += dt;
      this.updateBridge(dt);
      if (attempt !== this.attemptVersion) return;
      if (this.hasSnakes()) this.updateSnakes(dt);
      this.updatePlayer(dt);
      if (this.respawning || attempt !== this.attemptVersion) return;
      this.updateCanAction(dt);
      this.updateLooseCan(dt);
      if (this.respawning || attempt !== this.attemptVersion) return;
      if (this.hasRocks()) this.updateRocks(dt);
      if (this.respawning || attempt !== this.attemptVersion) return;
      this.updateProgress();
      this.updateParticles(dt);
      this.scoreFlash = Math.max(0, this.scoreFlash - dt);
    }

    updateMessage(dt) {
      if (this.messageTimer > 0) this.messageTimer -= dt;
      if (this.player.fullCanWarning > 0) this.player.fullCanWarning -= dt;
      if (this.player.bridgeWarning > 0) this.player.bridgeWarning -= dt;
    }

    currentLevelProgress() {
      const activeTrip = this.levelCans >= CANS_PER_LEVEL ? 0 : this.tripProgress;
      return clamp((this.levelCans + activeTrip) / CANS_PER_LEVEL, 0, 1);
    }

    estimateTripProgress() {
      const p = this.player;
      const c = this.can;
      const platform = c.held ? p.platform : c.platform;
      const x = c.held ? p.x : c.x;
      const n = (value, start, end) => clamp((value - start) / (end - start), 0, 1);
      let progress = 0;
      if (!c.full) {
        if (platform === 0) progress = .18 * n(x, 62, 420);
        else if (platform === 1) progress = .18 + .16 * n(x, 420, 75);
        else if (platform === 2) progress = .34 + .12 * n(x, 75, 420);
        else if (platform === BOTTOM_PLATFORM) progress = .46 + .02 * n(x, 420, 70);
        else if (platform === LOWER_BYPASS) progress = .39;
        else if (platform === UPPER_BYPASS) progress = .31;
        if (c.fill > 0) progress = Math.max(progress, .48 + .02 * c.fill);
      } else {
        if (platform === BOTTOM_PLATFORM) progress = .50 + .10 * n(x, 70, 35);
        else if (platform === LOWER_BYPASS) progress = .60 + .13 * n(x, 35, 385);
        else if (platform === UPPER_BYPASS) progress = .73 + .11 * n(x, 385, 25);
        else if (platform === 1) progress = .84 + .10 * n(x, 25, 420);
        else if (platform === 0) progress = .94 + .02 * n(x, 420, 65);
        else if (platform === 2) progress = .52;
        if (c.pour > 0) progress = Math.max(progress, .96 + .04 * c.pour);
      }
      return clamp(progress, 0, 1);
    }

    updateProgress() {
      this.tripProgress = Math.max(this.tripProgress, this.estimateTripProgress());
    }

    updateChimp(dt) {
      const c = this.chimp;
      c.blink += dt;
      c.timer -= dt;
      const pattern = ROCK_PATTERN[c.patternIndex % ROCK_PATTERN.length];
      if (c.phase === 'idle' && c.timer <= 0) {
        c.phase = 'windup';
        c.timer = .58;
        c.targetX = pattern.target;
      } else if (c.phase === 'windup' && c.timer <= 0) {
        this.throwRock(c.targetX);
        c.phase = 'recover';
        c.timer = .32;
      } else if (c.phase === 'recover' && c.timer <= 0) {
        c.patternIndex = (c.patternIndex + 1) % ROCK_PATTERN.length;
        c.phase = 'idle';
        c.timer = ROCK_PATTERN[c.patternIndex].delay;
      }
    }

    throwRock(targetX) {
      const targetY = this.surfaceY(0, targetX) - 12;
      this.rocks.push({
        state: 'thrown',
        t: 0,
        duration: .65,
        sx: 421,
        sy: 91,
        tx: targetX,
        ty: targetY,
        x: 421,
        y: 91,
        platform: 0,
        vx: 0,
        vy: 0,
        r: 10.5,
        spin: 0,
        dead: false
      });
      this.sound.tone(185, .08, 'triangle', .035, 125);
    }

    updateBridge(dt) {
      const b = this.bridge;
      b.shake += dt;
      if (b.state === 'warning') {
        b.timer -= dt;
        if (b.timer <= 0) this.collapseBridge();
      } else if (b.state === 'collapsed') {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.state = 'rebuilding';
          b.timer = .65;
          this.sound.tone(260, .09, 'square', .035, 410);
        }
      } else if (b.state === 'rebuilding') {
        b.timer -= dt;
        if (b.timer <= 0) b.state = 'solid';
      }
    }

    triggerBridge() {
      if (this.bridge.state !== 'solid') return;
      if (this.can.held && this.can.full) return;
      this.bridge.state = 'warning';
      this.bridge.timer = .78;
      this.sound.crack();
    }

    collapseBridge() {
      const b = this.bridge;
      b.state = 'collapsed';
      b.timer = 4.1;
      this.sound.collapse();
      this.addDust((BRIDGE_X1 + BRIDGE_X2) / 2, this.surfaceY(2, 260), 15);
      const p = this.player;
      const playerCaught = p.platform === 2 && p.x > BRIDGE_X1 && p.x < BRIDGE_X2 && p.grounded;
      const canCaught = !this.can.held && this.can.platform === 2 && this.can.x > BRIDGE_X1 && this.can.x < BRIDGE_X2;
      if (playerCaught || canCaught) {
        this.stats.falls++;
        this.failCurrentCan(canCaught && this.can.full ? 'FULL CAN BROKE THE WALKWAY' : 'WALKWAY FALL!');
      }
    }

    updateSnakes(dt) {
      this.crushSnakeWithFullCan();
      for (const s of this.snakes) {
        s.phase += dt * 5;
        s.cooldown = Math.max(0, s.cooldown - dt);
        if (s.squashed) {
          s.respawn -= dt;
          if (s.respawn <= 0) {
            s.x = s.startX;
            s.squashed = false;
            s.respawn = 0;
            s.cooldown = .8;
            s.dir = s.startDir;
            const sy = this.surfaceY(s.platform, s.x);
            this.addBurst(s.x, sy - 7, 7, '#d8e94b');
            if (Math.abs(this.player.x - s.x) < 130 && this.player.platform === s.platform) {
              this.message = 'THE SNAKE IS BACK';
              this.messageTimer = .9;
            }
          }
          continue;
        }
        s.x += s.dir * s.speed * dt;
        if (s.x <= s.min) { s.x = s.min; s.dir = 1; }
        if (s.x >= s.max) { s.x = s.max; s.dir = -1; }
      }
    }

    updatePlayer(dt) {
      const attempt = this.attemptVersion;
      const p = this.player;
      p.prevY = p.y;
      p.invuln = Math.max(0, p.invuln - dt);
      p.stun = Math.max(0, p.stun - dt);
      p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
      if (p.grounded) p.coyote = .1;
      else p.coyote = Math.max(0, p.coyote - dt);

      if (p.climbing) {
        const c = p.climbing;
        c.t += dt / c.duration;
        const t = clamp(c.t, 0, 1);
        const eased = t * t * (3 - 2 * t);
        p.x = c.x;
        p.y = lerp(c.y1, c.y2, eased);
        p.step += dt * 10;
        if (t >= 1) {
          p.platform = c.to;
          p.y = this.surfaceY(c.to, c.x);
          p.climbing = null;
          p.grounded = true;
          p.vx = 0;
          p.coyote = .1;
          p.connectorLock = { to: c.from, x: c.x };
        }
        this.syncHeldCan();
        return;
      }

      const move = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      const working = this.isWorkingCan();
      if (move && p.stun <= 0 && !working) p.facing = move;
      const speed = this.can.held && this.can.full ? 152 : 200;
      const target = p.stun > 0 || working ? 0 : move * speed;
      p.vx = approach(p.vx, target, (p.grounded ? 1240 : 600) * dt);
      if (!move && p.grounded) p.vx = approach(p.vx, 0, 1520 * dt);
      const oldX = p.x;
      p.x += p.vx * dt;
      const oldStep = Math.floor(p.step / 3);
      p.step += Math.abs(p.vx) * dt * .11;
      if (p.grounded && Math.floor(p.step / 3) !== oldStep) this.sound.step();

      const pf = this.platforms[p.platform];
      p.x = clamp(p.x, pf.x1, pf.x2);
      if (p.connectorLock && Math.abs(p.x - p.connectorLock.x) > 18) p.connectorLock = null;
      this.blockFullCanAtBridge(oldX);

      if (p.grounded && p.stun <= 0 && !working) this.tryConnector(move);
      if (p.climbing) {
        this.syncHeldCan();
        return;
      }

      if (p.jumpBuffer > 0 && !(this.can.held && this.can.full) && p.coyote > 0 && p.stun <= 0 && !working) {
        p.jumpBuffer = 0;
        p.coyote = 0;
        p.grounded = false;
        p.vy = -355;
        this.sound.jump();
      }

      if (!p.grounded) {
        p.vy += 890 * dt;
        p.y += p.vy * dt;
      } else {
        p.y = this.surfaceY(p.platform, p.x);
      }

      let hasGround = true;
      if (p.platform === 2 && this.bridgeIsOpenAt(p.x)) hasGround = false;
      if (p.platform === 2 && p.x > BRIDGE_X1 && p.x < BRIDGE_X2 && p.grounded) this.triggerBridge();

      const surf = this.surfaceY(p.platform, p.x);
      if (!p.grounded && hasGround && p.vy >= 0 && p.y >= surf) {
        p.y = surf;
        p.vy = 0;
        p.grounded = true;
        p.coyote = .1;
        this.sound.land();
      }

      if (p.platform === 2 && !p.grounded && this.bridgeIsOpenAt(p.x) && p.y >= surf + 38) {
        this.stats.falls++;
        this.failCurrentCan('WALKWAY FALL!');
        return;
      }

      if (this.hasSnakes()) this.checkSnakeCollisions();
      if (this.respawning || attempt !== this.attemptVersion) return;
      this.syncHeldCan();
    }

    blockFullCanAtBridge(oldX) {
      const p = this.player;
      if (p.platform !== 2 || !p.grounded || !this.can.held || !this.can.full) return;
      const leftStop = BRIDGE_X1 - 14;
      const rightStop = BRIDGE_X2 + 14;
      let blocked = false;
      if (oldX <= leftStop && p.x > leftStop) { p.x = leftStop; blocked = true; }
      else if (oldX >= rightStop && p.x < rightStop) { p.x = rightStop; blocked = true; }
      else if (p.x > leftStop && p.x < rightStop) {
        p.x = p.facing > 0 ? leftStop : rightStop;
        blocked = true;
      }
      if (blocked) {
        p.vx = 0;
        if (p.bridgeWarning <= 0) {
          p.bridgeWarning = 1.2;
          this.message = 'FULL CAN TOO HEAVY — TAKE THE LONG WAY';
          this.messageTimer = 1.5;
          this.sound.noJump();
        }
      }
    }

    warnLongRoute() {
      const p = this.player;
      p.vx = 0;
      if (p.bridgeWarning <= 0) {
        p.bridgeWarning = 1.2;
        this.message = 'FULL CAN — LONG WAY STARTS BY THE WATER';
        this.messageTimer = 1.5;
        this.sound.noJump();
      }
    }

    tryConnector(move) {
      const p = this.player;
      const fullLoad = this.can.held && this.can.full;
      let to = null;
      let x = p.x;
      if (p.platform === 0 && move > 0 && p.x >= 417) { to = 1; x = 420; }
      else if (p.platform === 1 && move > 0 && p.x >= 417) { to = 0; x = 420; }
      else if (p.platform === 1 && move < 0 && p.x <= 28) { to = UPPER_BYPASS; x = 25; }
      else if (p.platform === 1 && move < 0 && p.x <= 78 && !fullLoad) { to = 2; x = 75; }
      else if (p.platform === 2 && move < 0 && p.x <= 78) { to = 1; x = 75; }
      else if (p.platform === 2 && move > 0 && p.x >= 417) { to = BOTTOM_PLATFORM; x = 420; }
      else if (p.platform === UPPER_BYPASS && move < 0 && p.x <= 28) { to = 1; x = 25; }
      else if (p.platform === UPPER_BYPASS && move > 0 && p.x >= 382) { to = LOWER_BYPASS; x = 385; }
      else if (p.platform === LOWER_BYPASS && move < 0 && p.x <= 38) { to = BOTTOM_PLATFORM; x = 35; }
      else if (p.platform === LOWER_BYPASS && move > 0 && p.x >= 382) { to = UPPER_BYPASS; x = 385; }
      else if (p.platform === BOTTOM_PLATFORM && move < 0 && p.x <= 38) { to = LOWER_BYPASS; x = 35; }
      else if (p.platform === BOTTOM_PLATFORM && move > 0 && p.x >= 417) {
        if (fullLoad) { this.warnLongRoute(); return; }
        to = 2; x = 420;
      }
      if (to === null) return;
      if (p.connectorLock && to === p.connectorLock.to) return;
      const y1 = this.surfaceY(p.platform, x);
      const y2 = this.surfaceY(to, x);
      p.climbing = {
        from: p.platform,
        to,
        x,
        y1,
        y2,
        t: 0,
        duration: (fullLoad ? .66 : .52) + Math.abs(y2 - y1) / 390
      };
      p.grounded = false;
      p.vx = 0;
    }

    jump() {
      if (this.state !== 'playing' || this.respawning) return;
      this.sound.unlock();
      const p = this.player;
      if (p.climbing || p.stun > 0) return;
      if (this.can.held && this.can.full) {
        if (p.grounded) {
          p.fullCanWarning = 1.5;
          this.message = 'SET THE FULL CAN DOWN TO JUMP';
          this.messageTimer = 1.5;
          this.sound.noJump();
        }
        return;
      }
      p.jumpBuffer = .12;
    }

    squashSnake(s, byFullCan = false) {
      if (s.squashed) return false;
      const sy = this.surfaceY(s.platform, s.x);
      s.squashed = true;
      s.respawn = s.respawnDelay;
      s.cooldown = 0;
      this.stats.snakes++;
      this.addBurst(s.x, sy - 8, byFullCan ? 12 : 8, byFullCan ? '#7ed5e8' : '#d5e748');
      if (byFullCan) this.sound.crush(); else this.sound.stomp();
      this.vibrate(byFullCan ? 28 : 16);
      this.message = byFullCan ? 'FULL CAN CRUSHED THE SNAKE' : 'SNAKE SQUASHED';
      this.messageTimer = byFullCan ? 1.1 : .8;
      return true;
    }

    crushSnakeWithFullCan(whileLowering = false) {
      if (!this.hasSnakes()) return false;
      const c = this.can;
      if (c.held || !c.full || (!whileLowering && c.dropLift > .18)) return false;
      for (const s of this.snakes) {
        if (s.squashed || s.platform !== c.platform) continue;
        if (Math.abs(c.x - s.x) <= 27) {
          c.vx = 0;
          return this.squashSnake(s, true);
        }
      }
      return false;
    }

    checkSnakeCollisions() {
      if (!this.hasSnakes()) return;
      const p = this.player;
      if (p.invuln > 0 || p.climbing) return;
      for (const s of this.snakes) {
        if (s.squashed || s.cooldown > 0 || s.platform !== p.platform) continue;
        const sy = this.surfaceY(s.platform, s.x);
        const dx = Math.abs(p.x - s.x);
        if (dx > 23) continue;
        if (!p.grounded && p.vy > 0 && p.prevY < sy - 8 && p.y >= sy - 20) {
          if (this.squashSnake(s, false)) {
            p.y = sy - 23;
            p.vy = -245;
          }
          continue;
        }
        if (p.grounded && dx < 20) {
          s.cooldown = 1.1;
          this.hitPlayer(s.x < p.x ? 1 : -1, 'SNAKE!');
          return;
        }
      }
    }

    beginCanAction() {
      if (this.state !== 'playing' || this.canPress) return;
      this.sound.unlock();
      this.canPress = { time: 0, context: null, consumed: false, ticks: 0 };
    }

    endCanAction(commitTap = true) {
      if (!this.canPress) return;
      const press = this.canPress;
      const quick = commitTap && press.time < .16 && !press.consumed && !press.worked;
      this.player.blocking = false;
      this.canPress = null;
      if (quick) this.tapCan();
    }

    cancelCanAction() {
      this.endCanAction(false);
    }

    isWorkingCan() {
      return !!(this.canPress && (this.canPress.context === 'fill' || this.canPress.context === 'pour') && this.canPress.time > .12);
    }

    canContext() {
      const p = this.player;
      if (!this.can.held || !p.grounded || p.climbing) return null;
      if (!this.can.full && p.platform === BOTTOM_PLATFORM && p.x < 112) return 'fill';
      if (this.can.full && p.platform === 0 && p.x < 112) return 'pour';
      return 'block';
    }

    updateCanAction(dt) {
      if (!this.canPress) {
        this.can.fill = 0;
        this.can.pour = 0;
        this.player.blocking = false;
        return;
      }
      const press = this.canPress;
      press.time += dt;
      press.context = this.canContext();
      if (press.context === 'fill') {
        this.player.blocking = false;
        if (press.time > .12) {
          press.worked = true;
          this.can.fill = clamp(this.can.fill + dt / 1.15, 0, 1);
          const tick = Math.floor(this.can.fill * 8);
          if (tick > press.ticks) { press.ticks = tick; this.sound.fillTick(); }
          if (this.can.fill >= 1 && press.completedContext !== 'fill') {
            this.can.full = true;
            press.consumed = true;
            press.completedContext = 'fill';
            this.can.fill = 0;
            this.sound.filled();
            this.message = 'FULL CAN — TAKE THE LONG PATH LEFT';
            this.messageTimer = 2.4;
          }
        }
      } else if (press.context === 'pour') {
        this.player.blocking = false;
        if (press.time > .12) {
          press.worked = true;
          this.can.pour = clamp(this.can.pour + dt / .9, 0, 1);
          if (this.can.pour >= 1 && press.completedContext !== 'pour') {
            press.consumed = true;
            press.completedContext = 'pour';
            this.deliverCan();
          }
        }
      } else if (press.context === 'block') {
        this.can.fill = 0;
        this.can.pour = 0;
        this.player.blocking = press.time > .16 && this.can.held;
      } else {
        this.player.blocking = false;
        this.can.fill = 0;
        this.can.pour = 0;
      }
    }

    tapCan() {
      const p = this.player;
      if (p.climbing || p.stun > 0) return;
      if (this.can.held) {
        this.forceDropCan();
      } else if (this.can.platform === p.platform && Math.abs(this.can.x - p.x) < 39 && p.grounded) {
        this.can.held = true;
        this.can.x = p.x;
        this.can.platform = p.platform;
        this.can.vx = 0;
        this.can.dropLift = 0;
        this.sound.pickup();
      } else {
        this.message = 'MOVE NEXT TO THE JERRY CAN';
        this.messageTimer = 1.1;
      }
    }

    forceDropCan() {
      const p = this.player;
      if (!this.can.held) return;
      const edge = p.facing > 0 ? this.platforms[p.platform].x2 - 9 : this.platforms[p.platform].x1 + 9;
      const target = p.facing > 0 ? Math.min(p.x + 25, edge) : Math.max(p.x - 25, edge);
      if ((target - p.x) * p.facing < 10) {
        this.message = 'NO ROOM AHEAD — STEP BACK OR TURN'; this.messageTimer = 1.2;
        this.sound.noJump(); return;
      }
      this.can.held = false;
      this.can.platform = p.platform;
      this.can.x = target;
      this.can.vx = 0;
      this.can.dropLift = 1;
      if (p.platform === 2 && this.bridgeIsOpenAt(this.can.x)) this.can.platform = UPPER_BYPASS;
      this.crushSnakeWithFullCan(true);
      this.sound.drop();
    }

    syncHeldCan() {
      if (!this.can.held) return;
      this.can.platform = this.player.platform;
      this.can.x = this.player.x;
      this.can.vx = 0;
      this.can.dropLift = 0;
    }

    updateLooseCan(dt) {
      const attempt = this.attemptVersion;
      const c = this.can;
      c.hitFlash = Math.max(0, c.hitFlash - dt);
      if (c.held) return;
      c.dropLift = Math.max(0, c.dropLift - dt * 5.2);
      if (c.dropLift > 0) return;
      if (Math.abs(c.vx) > .1) {
        c.x += c.vx * dt;
        c.vx = approach(c.vx, 0, (c.full ? 150 : 165) * dt);
        const pf = this.platforms[c.platform];
        if (c.x <= pf.x1 + 9) { c.x = pf.x1 + 9; c.vx = 0; }
        if (c.x >= pf.x2 - 9) { c.x = pf.x2 - 9; c.vx = 0; }
      }
      if (c.platform === 2 && c.x > BRIDGE_X1 && c.x < BRIDGE_X2) {
        if (c.full && this.bridge.state !== 'collapsed') {
          this.message = 'THE FULL CAN BROKE THROUGH THE WALKWAY';
          this.messageTimer = 1.4;
          this.collapseBridge();
          if (this.respawning || attempt !== this.attemptVersion) return;
        } else if (this.bridge.state === 'collapsed') {
          c.platform = UPPER_BYPASS;
          c.x = clamp(c.x, this.platforms[UPPER_BYPASS].x1 + 9, this.platforms[UPPER_BYPASS].x2 - 9);
          c.vx *= .35;
        }
      }
      this.crushSnakeWithFullCan();
    }

    deliverCan() {
      const split = Math.max(0, this.elapsed - this.canStartElapsed);
      this.canSplits.push(split);
      this.levelCans++;
      this.score++;
      this.stats.deliveries = this.score;
      this.scoreFlash = .7;
      this.setScoreText();
      this.sound.pour();
      this.sound.score();
      this.addBurst(72, this.surfaceY(0, 72) - 45, 18, '#ffd94e');
      if (this.levelCans >= CANS_PER_LEVEL) {
        this.message = 'THREE CANS DELIVERED!';
        this.messageTimer = 1.2;
        this.completeLevel();
        return;
      }
      this.canStartElapsed = this.elapsed;
      this.cancelControlTouches?.('can-delivered');
      this.resetCurrentCan(false, `CAN ${this.levelCans} DELIVERED — GO!`);
    }

    setScoreText() {
      $('score').textContent = `${this.levelCans}/${CANS_PER_LEVEL}`;
    }

    rockNext(platform) {
      // Rocks follow the visible downhill route only. The long bypass is an
      // uphill full-can route, so rocks never jump across to those platforms.
      return {
        // Rocks leave the top track through their own visible chute before the
        // player ladder. The short segment from the chute to x=420 is a real
        // safe landing pocket for the final climb.
        0: { exitX: ROCK_TOP_EXIT_X, platform: 1, x: ROCK_TOP_EXIT_X },
        1: { exitX: 75, platform: 2, x: 75 },
        2: { exitX: 420, platform: BOTTOM_PLATFORM, x: 420 }
      }[platform] || null;
    }

    startRockConnector(r, fromPlatform, next) {
      const x = next.x;
      const y1 = this.surfaceY(fromPlatform, x) - r.r;
      const y2 = this.surfaceY(next.platform, x) - r.r;
      r.state = 'connector';
      r.connector = { from: fromPlatform, to: next.platform, x, y1, y2 };
      r.platform = null;
      r.x = x;
      r.y = y1;
      r.t = 0;
      r.duration = Math.max(.24, Math.abs(y2 - y1) / 205);
      r.vx = 0;
      r.vy = 0;
    }

    dropRockThroughBridge(r) {
      r.state = 'bridgeDrop';
      r.platform = null;
      r.connector = null;
      r.vx = 0;
      r.vy = 45;
      r.targetY = this.surfaceY(UPPER_BYPASS, clamp(r.x, this.platforms[UPPER_BYPASS].x1, this.platforms[UPPER_BYPASS].x2)) - r.r;
    }

    hitLooseCanWithRock(r) {
      const c = this.can;
      c.vx = 0;
      this.stats.rocks++;
      c.hitFlash = .35;
      r.dead = true;
      this.addBurst(r.x, r.y, 9, '#e2bd82');
      this.sound.block();
      this.vibrate(18);
      this.message = c.full ? 'FULL CAN STOPPED THE ROCK' : 'CAN STOPPED THE ROCK';
      this.messageTimer = 1.0;
    }

    updateRocks(dt) {
      const attempt = this.attemptVersion;
      const p = this.player;
      for (const r of this.rocks) {
        if (r.dead) continue;
        if (r.state === 'thrown') {
          r.t += dt / r.duration;
          const t = clamp(r.t, 0, 1);
          r.x = lerp(r.sx, r.tx, t);
          r.y = lerp(r.sy, r.ty, t) - Math.sin(Math.PI * t) * 86;
          r.spin += dt * 10;
          if (t >= 1) {
            r.state = 'rolling';
            r.platform = 0;
            r.connector = null;
            r.x = r.tx;
            r.y = this.surfaceY(0, r.x) - r.r;
          }
        } else if (r.state === 'rolling') {
          const platformIndex = r.platform;
          const platform = this.platforms[platformIndex];
          const speed = this.level === 3 ? 94 : 88;
          const next = this.rockNext(platformIndex);
          r.vx = platform.downhill * speed;
          r.x += r.vx * dt;
          r.spin += r.vx * dt / r.r;

          if (platformIndex === 2 && this.bridgeIsOpenAt(r.x)) {
            this.dropRockThroughBridge(r);
          } else {
            r.y = this.surfaceY(platformIndex, r.x) - r.r;
            if (next) {
              const reachedConnector = platform.downhill > 0 ? r.x >= next.exitX : r.x <= next.exitX;
              if (reachedConnector) {
                r.x = next.exitX;
                r.y = this.surfaceY(platformIndex, r.x) - r.r;
                this.startRockConnector(r, platformIndex, next);
              }
            } else {
              const atEnd = platform.downhill > 0 ? r.x >= platform.x2 : r.x <= platform.x1;
              if (atEnd) r.dead = true;
            }
          }
        } else if (r.state === 'connector') {
          const c = r.connector;
          r.t += dt / r.duration;
          const t = clamp(r.t, 0, 1);
          const eased = t * t * (3 - 2 * t);
          r.x = c.x;
          r.y = lerp(c.y1, c.y2, eased) - Math.abs(Math.sin(t * Math.PI * 12)) * 2.5;
          r.spin += dt * 12;
          if (t >= 1) {
            r.platform = c.to;
            r.x = c.x;
            r.y = this.surfaceY(c.to, c.x) - r.r;
            r.state = 'rolling';
            r.connector = null;
            this.addDust(r.x, r.y + r.r, 5);
            this.sound.rolling();
          }
        } else if (r.state === 'bridgeDrop') {
          r.vy += 680 * dt;
          r.y += r.vy * dt;
          r.spin += dt * 9;
          if (r.y >= r.targetY) {
            r.dead = true;
            this.addBurst(r.x, r.targetY, 8, '#e2bd82');
            this.addDust(r.x, r.targetY + r.r, 6);
            this.sound.tone(90, .06, 'triangle', .022, 60);
          }
        }

        // Placement commits immediately; the brief lowering animation must not let a rock pass through the can.
        if (!r.dead && !this.can.held && r.state === 'rolling' && r.platform === this.can.platform && Math.abs(r.x - this.can.x) < 21) {
          this.hitLooseCanWithRock(r);
        }
        if (!r.dead && (r.state === 'rolling' || r.state === 'connector')) this.checkRockCollision(r, p);
        if (attempt !== this.attemptVersion) return;
      }
      this.rocks = this.rocks.filter((r) => !r.dead);
    }

    checkRockCollision(r, p) {
      if (p.invuln > 0) return;
      if (r.state === 'rolling') {
        // A rolling rock can only hit someone standing on that exact path.
        if (p.climbing || r.platform !== p.platform) return;
      } else if (r.state === 'connector') {
        // During a stair transition, only a player on the same connector can be hit.
        if (!p.climbing || !r.connector) return;
        const c = p.climbing;
        const rc = r.connector;
        const samePair = (c.from === rc.from && c.to === rc.to) || (c.from === rc.to && c.to === rc.from);
        if (!samePair || Math.abs(c.x - rc.x) > 1) return;
      } else {
        return;
      }
      const dx = r.x - p.x;
      const dy = r.y - (p.y - 21);
      if (Math.abs(dx) > 23 || Math.abs(dy) > 30) return;
      const facesRock = p.facing === (dx >= 0 ? 1 : -1);
      if (p.blocking && this.can.held && facesRock) {
        r.dead = true;
        this.stats.rocks++;
        p.vx = 0;
        this.addBurst(r.x, r.y, 10, '#e4c08f');
        this.sound.block();
        this.vibrate(24);
        this.message = 'ROCK BLOCKED';
        this.messageTimer = .7;
      } else {
        r.dead = true;
        this.hitPlayer(dx < 0 ? 1 : -1, 'ROCK HIT!', false);
      }
    }

    hitPlayer(push, text, moveCan = true) {
      this.failCurrentCan(text);
    }

    failCurrentCan(text) {
      if (this.state !== 'playing') return;
      const { x, y } = this.player;
      this.levelRetries++;
      this.stats.retries++;
      this.stats.hits++;
      this.sound.hit();
      this.vibrate([28, 24, 36]);
      this.resetCurrentCan(true, `${text} — CAN ${this.levelCans + 1}: GO!`);
      this.messageTimer = 1.4;
      this.addBurst(x, y - 24, 12, '#fff1a1');
      this.sound.retry();
    }

    vibrate(pattern) {
      if (navigator.vibrate) navigator.vibrate(pattern);
    }

    addBurst(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const speed = rand(35, 115);
        this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 35, life: rand(.35, .75), max: 1, color, size: rand(2, 5) });
      }
    }

    addDust(x, y, count) {
      for (let i = 0; i < count; i++) {
        this.particles.push({ x: x + rand(-18, 18), y: y + rand(-2, 5), vx: rand(-25, 25), vy: rand(-65, -20), life: rand(.35, .7), max: 1, color: '#d7aa72', size: rand(3, 7) });
      }
    }

    updateParticles(dt) {
      for (const q of this.particles) {
        q.life -= dt;
        q.vy += 150 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      this.particles = this.particles.filter((q) => q.life > 0);
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.drawSky(ctx);
      this.drawBackground(ctx);
      this.drawSun(ctx);
      this.drawVillage(ctx);
      this.drawMountainPaths(ctx);
      this.drawPuddle(ctx);
      this.drawBridge(ctx);
      this.drawTank(ctx);
      this.drawChimp(ctx);
      if (this.hasSnakes()) this.drawSnakes(ctx);
      if (this.hasRocks()) this.drawRocks(ctx);
      if (!this.respawning && !this.can.held) {
        const canY = this.surfaceY(this.can.platform, this.can.x) - 18 - this.can.dropLift * 34;
        ctx.save();
        ctx.translate(this.can.x, canY);
        if (this.can.hitFlash > 0) ctx.rotate(Math.sin(this.elapsed * 48) * .16 * (this.can.hitFlash / .35));
        this.drawCan(ctx, 0, 0, 1, false, this.can.full);
        ctx.restore();
      }
      this.drawPlayer(ctx);
      this.drawParticles(ctx);
      this.drawWorldUI(ctx);
    }

    drawSky(ctx) {
      const p = this.currentLevelProgress();
      const top = p < .65 ? mixColor('rgb(74,176,221)', 'rgb(250,146,80)', p / .65) : mixColor('rgb(250,146,80)', 'rgb(56,61,88)', (p - .65) / .35);
      const bottom = p < .65 ? mixColor('rgb(182,226,218)', 'rgb(255,191,100)', p / .65) : mixColor('rgb(255,191,100)', 'rgb(103,67,87)', (p - .65) / .35);
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, top);
      g.addColorStop(.72, bottom);
      g.addColorStop(1, '#87a85d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    drawBackground(ctx) {
      ctx.fillStyle = 'rgba(53,92,90,.42)';
      ctx.beginPath();
      ctx.moveTo(0, 195); ctx.lineTo(90, 80); ctx.lineTo(165, 170); ctx.lineTo(250, 60); ctx.lineTo(350, 180); ctx.lineTo(430, 90); ctx.lineTo(480, 155); ctx.lineTo(480, 390); ctx.lineTo(0, 390); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(41,105,74,.56)';
      ctx.beginPath();
      ctx.moveTo(0, 270); ctx.lineTo(75, 165); ctx.lineTo(145, 240); ctx.lineTo(235, 130); ctx.lineTo(330, 245); ctx.lineTo(405, 155); ctx.lineTo(480, 235); ctx.lineTo(480, 470); ctx.lineTo(0, 470); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#437a44';
      ctx.beginPath();
      ctx.moveTo(0, 390); ctx.quadraticCurveTo(100, 330, 205, 395); ctx.quadraticCurveTo(325, 315, 480, 390); ctx.lineTo(480, 860); ctx.lineTo(0, 860); ctx.closePath(); ctx.fill();
      // sparse trees in the world, never side borders
      for (const [x, y, s] of [[32,300,.8],[451,270,.72],[27,535,.76],[455,555,.84],[356,760,.62],[130,780,.58]]) this.drawTree(ctx, x, y, s);
    }

    drawTree(ctx, x, y, s) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#4e3824'; ctx.fillRect(-3, 0, 6, 24);
      ctx.fillStyle = '#235c37';
      for (const [dx,dy,r] of [[0,-4,14],[-10,5,11],[10,5,11],[0,10,12]]) { ctx.beginPath(); ctx.arc(dx,dy,r,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }

    drawSun(ctx) {
      const p = this.currentLevelProgress();
      const x = 350 + Math.sin(Math.PI * p) * 26;
      const y = lerp(76, 430, p);
      const radius = 72;
      const warm = clamp((p - .58) / .42, 0, 1);
      ctx.save();
      const glow = ctx.createRadialGradient(x, y, radius * .35, x, y, radius * 1.62);
      glow.addColorStop(0, 'rgba(255,244,160,.56)');
      glow.addColorStop(.52, 'rgba(255,196,85,.23)');
      glow.addColorStop(1, 'rgba(255,156,70,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, radius * 1.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mixColor('rgb(255,228,103)', 'rgb(255,119,66)', warm);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .28;
      ctx.fillStyle = '#fffbd6';
      ctx.beginPath(); ctx.arc(x - 20, y - 23, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawVillage(ctx) {
      this.drawHut(ctx, 18, 114, .85, '#d99042');
      this.drawHut(ctx, 105, 123, .68, '#cc7441');
      ctx.fillStyle = '#42673a';
      ctx.beginPath(); ctx.ellipse(72, 149, 74, 17, 0, 0, Math.PI*2); ctx.fill();
    }

    drawHut(ctx, x, y, s, wall) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s,s);
      ctx.fillStyle = wall; ctx.fillRect(0,0,55,35);
      ctx.fillStyle = '#6a3c24'; ctx.fillRect(22,13,13,22);
      ctx.fillStyle = '#e4bb5b'; ctx.beginPath(); ctx.moveTo(-8,2); ctx.lineTo(27,-20); ctx.lineTo(64,2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 3;
      for (let i=-4;i<62;i+=8) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+26,-17); ctx.stroke(); }
      ctx.restore();
    }

    drawMountainPaths(ctx) {
      for (let i = 0; i < this.platforms.length; i++) {
        if (i === 2) {
          this.drawPathSegment(ctx, i, this.platforms[i].x1, BRIDGE_X1);
          this.drawPathSegment(ctx, i, BRIDGE_X2, this.platforms[i].x2);
        } else {
          this.drawPathSegment(ctx, i, this.platforms[i].x1, this.platforms[i].x2);
        }
      }
      this.drawRockChute(ctx, ROCK_TOP_EXIT_X, this.surfaceY(0, ROCK_TOP_EXIT_X), this.surfaceY(1, ROCK_TOP_EXIT_X));
      this.drawSteps(ctx, 420, this.surfaceY(0,420), this.surfaceY(1,420), -1);
      this.drawSteps(ctx, 75, this.surfaceY(1,75), this.surfaceY(2,75), 1);
      this.drawSteps(ctx, 420, this.surfaceY(2,420), this.surfaceY(BOTTOM_PLATFORM,420), -1);
      this.drawSteps(ctx, 35, this.surfaceY(BOTTOM_PLATFORM,35), this.surfaceY(LOWER_BYPASS,35), 1);
      this.drawSteps(ctx, 385, this.surfaceY(LOWER_BYPASS,385), this.surfaceY(UPPER_BYPASS,385), -1);
      this.drawSteps(ctx, 25, this.surfaceY(UPPER_BYPASS,25), this.surfaceY(1,25), 1);
      this.drawRouteSigns(ctx);
    }

    drawRouteSigns(ctx) {
      const bridgeY = this.surfaceY(2, 260) - 44;
      ctx.save();
      ctx.fillStyle = '#70502d';
      ctx.fillRect(248, bridgeY - 4, 5, 36);
      ctx.fillStyle = '#f2ce68';
      ctx.beginPath(); ctx.roundRect(205, bridgeY - 28, 91, 28, 5); ctx.fill();
      ctx.strokeStyle = '#6f4e28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2b20'; ctx.font = '900 9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('EMPTY CAN ONLY', 250.5, bridgeY - 11);

      const routeY = this.surfaceY(BOTTOM_PLATFORM, 130) - 52;
      ctx.fillStyle = '#70502d';
      ctx.fillRect(126, routeY - 2, 5, 35);
      ctx.fillStyle = '#ffd85a';
      ctx.beginPath(); ctx.roundRect(72, routeY - 28, 112, 28, 5); ctx.fill();
      ctx.strokeStyle = '#6f4e28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2b20'; ctx.font = '900 10px system-ui';
      ctx.fillText('← FULL CAN PATH', 128, routeY - 11);
      ctx.restore();
    }

    drawPathSegment(ctx, index, x1, x2) {
      const y1 = this.surfaceY(index, x1), y2 = this.surfaceY(index, x2);
      ctx.strokeStyle = '#5c3424'; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(x1, y1 + 8); ctx.lineTo(x2, y2 + 8); ctx.stroke();
      ctx.strokeStyle = '#a6633d'; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#d28a4b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x1, y1 - 15); ctx.lineTo(x2, y2 - 15); ctx.stroke();
      ctx.strokeStyle = '#3d733d'; ctx.lineWidth = 7;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(x1, y1 - 18); ctx.lineTo(x2, y2 - 18); ctx.stroke();
      ctx.setLineDash([]);
    }

    drawSteps(ctx, x, y1, y2, side) {
      const top = Math.min(y1,y2), bottom = Math.max(y1,y2);
      ctx.strokeStyle = '#5a3425'; ctx.lineWidth = 28;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.fillStyle = '#a9643e';
      const n = 6;
      for (let i=0;i<n;i++) {
        const y = lerp(top, bottom, (i+.5)/n);
        ctx.fillRect(x - 15, y - 6, 30, 10);
        ctx.fillStyle = '#d18a4d'; ctx.fillRect(x - 15, y - 6, 30, 3); ctx.fillStyle = '#a9643e';
      }
      ctx.strokeStyle = '#3a6b39'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + side*18, top); ctx.lineTo(x + side*18, bottom); ctx.stroke();
    }

    drawRockChute(ctx, x, y1, y2) {
      const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      ctx.save();
      ctx.strokeStyle = '#4a372d';
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.strokeStyle = '#776254';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 9, top); ctx.lineTo(x - 9, bottom); ctx.moveTo(x + 9, top); ctx.lineTo(x + 9, bottom); ctx.stroke();
      ctx.fillStyle = '#8b7b6d';
      for (let y = top + 13; y < bottom - 7; y += 24) {
        ctx.beginPath(); ctx.arc(x + (Math.floor(y / 24) % 2 ? -2 : 3), y, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe47a';
      ctx.font = '900 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ROCK CHUTE', x, top - 8);
      ctx.restore();
    }

    drawBridge(ctx) {
      const y1 = this.surfaceY(2, BRIDGE_X1), y2 = this.surfaceY(2, BRIDGE_X2);
      const b = this.bridge;
      ctx.save();
      const warningShake = b.state === 'warning' ? Math.sin(b.shake * 44) * 2.4 : 0;
      ctx.translate(0, warningShake);
      ctx.strokeStyle = '#4c3324'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(BRIDGE_X1 - 5, y1 - 20); ctx.quadraticCurveTo(260, (y1+y2)/2 - 10, BRIDGE_X2 + 5, y2 - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(BRIDGE_X1 - 5, y1 + 5); ctx.quadraticCurveTo(260, (y1+y2)/2 + 15, BRIDGE_X2 + 5, y2 + 5); ctx.stroke();
      let visibleT = 1;
      if (b.state === 'rebuilding') visibleT = 1 - b.timer / .65;
      const count = 8;
      for (let i=0;i<count;i++) {
        if (b.state === 'collapsed' && i > 1 && i < count-2) continue;
        if (b.state === 'rebuilding' && i/count > visibleT) continue;
        const t = i/(count-1);
        let x = lerp(BRIDGE_X1, BRIDGE_X2, t);
        let y = lerp(y1, y2, t);
        if (b.state === 'collapsed' && (i===1 || i===count-2)) y += 18;
        ctx.save(); ctx.translate(x,y); ctx.rotate(.08*Math.sin(i*2.2));
        ctx.fillStyle = b.state === 'warning' && i%2 ? '#b47d41' : '#8a5a33';
        ctx.fillRect(-10,-13,20,25);
        ctx.fillStyle = '#c89353'; ctx.fillRect(-10,-13,20,4);
        ctx.strokeStyle = '#50301f'; ctx.lineWidth = 1.5; ctx.strokeRect(-10,-13,20,25);
        if (b.state === 'warning' && i===3) { ctx.beginPath(); ctx.moveTo(-2,-10); ctx.lineTo(4,-2); ctx.lineTo(-3,8); ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore();
    }

    drawPuddle(ctx) {
      const y = this.surfaceY(BOTTOM_PLATFORM, 70) + 20;
      ctx.fillStyle = 'rgba(49,89,66,.45)'; ctx.beginPath(); ctx.ellipse(70, y+11, 69, 18, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#54a7c8'; ctx.beginPath(); ctx.ellipse(70, y, 58, 15, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#a8e4e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(61,y-1,25,.2,2.4); ctx.stroke();
      ctx.fillStyle = '#3f6c42';
      for (const x of [20,33,111,120]) { ctx.beginPath(); ctx.moveTo(x,y+4); ctx.lineTo(x-4,y-14); ctx.lineTo(x+1,y-4); ctx.lineTo(x+5,y-17); ctx.lineTo(x+7,y+5); ctx.fill(); }
      ctx.font = '900 12px system-ui'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillText('WATER',70,y+35);
    }

    drawTank(ctx) {
      const x=48, y=this.surfaceY(0,65)-48;
      ctx.save(); ctx.translate(x,y);
      ctx.fillStyle='#777e76'; ctx.fillRect(-22,-15,44,43);
      ctx.fillStyle='#a9b1a8'; ctx.fillRect(-19,-12,38,8);
      ctx.strokeStyle='#343b36'; ctx.lineWidth=3; ctx.strokeRect(-22,-15,44,43);
      ctx.fillStyle='#58a7c8'; ctx.fillRect(-16,10,32,12);
      ctx.fillStyle='#d8d7bf'; ctx.fillRect(18,2,13,5); ctx.fillRect(26,2,5,11);
      ctx.restore();
    }

    drawChimp(ctx) {
      const c = this.chimp;
      const x = 420, y = 99;
      ctx.save(); ctx.translate(x,y);
      ctx.fillStyle='#6b4b32'; ctx.fillRect(-38,25,76,12);
      ctx.fillStyle='#8b6941'; ctx.fillRect(-34,24,68,4);
      const active = this.hasRocks();
      const bounce = active && c.phase === 'windup' ? -3 : Math.sin(this.elapsed*3)*1.2;
      ctx.translate(0,bounce);
      ctx.strokeStyle='#3a251d'; ctx.lineWidth=8;
      ctx.beginPath(); ctx.moveTo(-14,18); ctx.lineTo(-25,31); ctx.moveTo(14,18); ctx.lineTo(25,31); ctx.stroke();
      ctx.fillStyle='#3e2d26'; ctx.beginPath(); ctx.ellipse(0,7,18,23,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(0,-13,15,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#b5885f'; ctx.beginPath(); ctx.ellipse(0,-10,10,8,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#16120f'; ctx.beginPath(); ctx.arc(-4,-14,1.6,0,Math.PI*2); ctx.arc(4,-14,1.6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#3e2d26'; ctx.lineWidth=8;
      if (active && c.phase === 'windup') {
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-18,-24); ctx.moveTo(10,0); ctx.lineTo(18,-24); ctx.stroke();
        ctx.fillStyle='#75675a'; ctx.beginPath(); ctx.arc(0,-38,11,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#473d36'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-5,-43); ctx.lineTo(3,-35); ctx.lineTo(7,-43); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-21,14); ctx.moveTo(10,0); ctx.lineTo(21,14); ctx.stroke();
      }
      ctx.restore();
    }

    drawSnakes(ctx) {
      for (const s of this.snakes) {
        const y = this.surfaceY(s.platform, s.x);
        ctx.save(); ctx.translate(s.x,y-4);
        if (s.squashed) {
          ctx.strokeStyle='#b6cc31'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(-14,0); ctx.quadraticCurveTo(-5,4,2,0); ctx.quadraticCurveTo(9,-4,15,0); ctx.stroke();
          ctx.fillStyle='#d7e84b'; ctx.beginPath(); ctx.ellipse(14,-1,7,4,0,0,Math.PI*2); ctx.fill();
        } else {
          ctx.strokeStyle='#aacb30'; ctx.lineWidth=8;
          ctx.beginPath(); ctx.moveTo(-16,2); ctx.bezierCurveTo(-8,-7+Math.sin(s.phase)*2,0,9,9,0); ctx.stroke();
          ctx.fillStyle='#d9e84a'; ctx.beginPath(); ctx.ellipse(14,-3,8,6,.15,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#1d2918'; ctx.beginPath(); ctx.arc(17,-5,1.3,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#d6523d'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(21,-2); ctx.lineTo(26,-1); ctx.moveTo(25,-1); ctx.lineTo(28,-3); ctx.moveTo(25,-1); ctx.lineTo(28,1); ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawRocks(ctx) {
      for (const r of this.rocks) {
        ctx.save(); ctx.translate(r.x,r.y); ctx.rotate(r.spin);
        ctx.fillStyle='#71675d'; ctx.beginPath(); ctx.arc(0,0,r.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#423b36'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-4,-7); ctx.lineTo(2,-1); ctx.lineTo(-2,6); ctx.moveTo(3,-6); ctx.lineTo(7,-1); ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(-3,-4,3,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    drawPlayer(ctx) {
      const p = this.player;
      if (p.dead || this.respawning) return;
      const blink = p.invuln > 0 && Math.floor(p.invuln*14)%2===0;
      if (blink) return;
      ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.facing,1);
      const walk = p.grounded && !p.climbing ? Math.sin(p.step) : 0;
      const climbing = !!p.climbing;
      ctx.strokeStyle='#39251b'; ctx.lineWidth=6;
      if (climbing) {
        ctx.beginPath(); ctx.moveTo(-5,-14); ctx.lineTo(-11,4); ctx.moveTo(5,-14); ctx.lineTo(11,4); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-5,-14); ctx.lineTo(-7+walk*4,3); ctx.moveTo(5,-14); ctx.lineTo(8-walk*4,3); ctx.stroke();
      }
      ctx.fillStyle='#f0a33f'; ctx.beginPath(); ctx.roundRect(-10,-38,20,25,7); ctx.fill();
      ctx.fillStyle='#285c75'; ctx.fillRect(-10,-20,20,8);
      ctx.fillStyle='#6c3c24'; ctx.beginPath(); ctx.arc(0,-49,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2b1b14'; ctx.beginPath(); ctx.arc(-1,-53,9,Math.PI,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,-50,1.4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#6c3c24'; ctx.lineWidth=5;
      if (this.can.held) {
        const workingCan = this.isWorkingCan();
        if (p.blocking) {
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(20,-35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(12,-29); ctx.stroke();
          this.drawCan(ctx, 28, -34, 1, true, this.can.full);
        } else if (workingCan) {
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(17,-19); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(9,-17); ctx.stroke();
          this.drawCan(ctx, 22, -12, 1, false, this.can.full);
        } else {
          const headBob = p.grounded && !climbing ? Math.abs(walk) * 1.2 : 0;
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(9,-61-headBob); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(-9,-61-headBob); ctx.stroke();
          this.drawCan(ctx, 0, -75-headBob, 1, false, this.can.full);
        }
      } else {
        ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(14,-18); ctx.moveTo(-7,-34); ctx.lineTo(-13,-19); ctx.stroke();
      }
      ctx.restore();
    }

    drawCan(ctx, x, y, facing=1, blocking=false, full=false) {
      ctx.save(); ctx.translate(x,y); if (blocking) ctx.rotate(-.18);
      ctx.fillStyle='#edc323'; ctx.beginPath(); ctx.roundRect(-10,-15,20,30,4); ctx.fill();
      ctx.strokeStyle='#6f5710'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#142a27'; ctx.fillRect(-4,-12,8,6);
      ctx.strokeStyle='#6f5710'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-5,-13); ctx.lineTo(-5,-19); ctx.lineTo(5,-19); ctx.lineTo(5,-13); ctx.stroke();
      ctx.fillStyle=full ? '#4fa2c8' : 'rgba(255,255,255,.28)'; ctx.fillRect(-6,5,12,6);
      if (full) { ctx.strokeStyle='#dff6ff'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-5,6); ctx.quadraticCurveTo(0,4,5,6); ctx.stroke(); }
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const q of this.particles) {
        ctx.globalAlpha = clamp(q.life/.6,0,1);
        ctx.fillStyle=q.color; ctx.beginPath(); ctx.arc(q.x,q.y,q.size,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    drawWorldUI(ctx) {
      const p = this.player;
      const levelLabel = `L${this.level}  ${this.levelConfig().name}  •  ${this.levelCans}/${CANS_PER_LEVEL}`;
      ctx.save();
      ctx.font = '950 20px system-ui';
      const levelW = ctx.measureText(levelLabel).width + 19;
      ctx.fillStyle = 'rgba(12,31,21,.72)';
      ctx.beginPath(); ctx.roundRect(8, 55, levelW, 25, 10); ctx.fill();
      ctx.fillStyle = '#fff1aa';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(levelLabel, 18, 68);
      const timeLabel = formatTime(this.elapsed);
      ctx.font = '950 20px system-ui';
      const timeW = ctx.measureText(timeLabel).width + 20;
      const timeX = WORLD_W - timeW - 8;
      ctx.fillStyle = 'rgba(12,31,21,.82)';
      ctx.beginPath(); ctx.roundRect(timeX, 55, timeW, 25, 10); ctx.fill();
      ctx.fillStyle = '#fff1aa';
      ctx.textAlign = 'center';
      ctx.fillText(timeLabel, timeX + timeW / 2, 68);
      ctx.restore();
      let prompt = '';
      if (this.state === 'playing') {
        if (this.respawning) prompt = this.message;
        else if (this.can.held && !this.can.full && p.platform === BOTTOM_PLATFORM && p.x < 112 && p.grounded) prompt = 'HOLD CAN TO FILL';
        else if (this.can.held && this.can.full && p.platform === 0 && p.x < 112 && p.grounded) prompt = 'HOLD CAN TO POUR';
        else if (this.can.held && this.can.full && p.platform === BOTTOM_PLATFORM && p.x < 125 && p.grounded) prompt = 'FULL CAN — TAKE THE LONG PATH LEFT';
        else if (this.can.held && this.can.full && p.platform === 2 && p.x > BRIDGE_X1 - 45 && p.x < BRIDGE_X2 + 45) prompt = 'BRIDGE TOO WEAK — TAKE THE LONG PATH';
        else if (!this.can.held && this.can.platform === p.platform && Math.abs(this.can.x-p.x)<45) prompt = 'TAP CAN TO PICK UP';
        else if (p.fullCanWarning > 0) prompt = 'FULL CAN — SET IT DOWN TO JUMP';
        else if (this.messageTimer > 0) prompt = this.message;
      }
      if (prompt) {
        ctx.save(); ctx.font='900 14px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
        const w=Math.min(390,ctx.measureText(prompt).width+28);
        ctx.fillStyle='rgba(12,31,21,.79)'; ctx.beginPath(); ctx.roundRect((WORLD_W-w)/2,17,w,31,13); ctx.fill();
        ctx.fillStyle='#fff6cb'; ctx.fillText(prompt,WORLD_W/2,33);
        ctx.restore();
      }
      const progress = this.can.fill || this.can.pour;
      if (progress > 0) {
        const x=p.x, y=p.y-82;
        ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(x,y,17,-Math.PI/2,Math.PI*1.5); ctx.stroke();
        ctx.strokeStyle=this.can.fill?'#70d4ef':'#ffd94e'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(x,y,17,-Math.PI/2,-Math.PI/2+Math.PI*2*progress); ctx.stroke();
      }
      if (this.scoreFlash > 0) {
        const flash = `CAN ${Math.min(this.levelCans, CANS_PER_LEVEL)}/${CANS_PER_LEVEL}`;
        ctx.save(); ctx.globalAlpha=clamp(this.scoreFlash/.35,0,1); ctx.font='950 32px system-ui'; ctx.textAlign='center'; ctx.fillStyle='#ffe05b'; ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=6; ctx.strokeText(flash,WORLD_W/2,92); ctx.fillText(flash,WORLD_W/2,92); ctx.restore();
      }
    }
  }

  const canvas = $('game');
  const game = new Game(canvas);
  window.CR = { buildId: BUILD_ID, saveVersion: SAVE_VERSION, dev: BUILD_LEVEL_SELECT };
  if (BUILD_LEVEL_SELECT) window.CR.game = game;
  const overlay = $('overlay');
  const title = $('overlayTitle');
  const subtitle = $('overlaySubtitle');
  const body = $('overlayBody');
  const statsBox = $('statsBox');
  const levelSelectBox = $('levelSelectBox');
  const primary = $('primaryBtn');
  const secondary = $('secondaryBtn');
  const soundBtn = $('soundBtn');
  let primaryAction = () => {}, secondaryAction = () => {};
  primary.addEventListener('click', () => { game.sound.unlock(); game.sound.menu(); primaryAction(); });
  secondary.addEventListener('click', () => { game.sound.unlock(); game.sound.menu(); secondaryAction(); });

  function renderLevelSelect() {
    const available = game.canSelectLevels();
    levelSelectBox.classList.toggle('hidden', !available);
    if (!available) { levelSelectBox.replaceChildren(); return; }
    const titleText = BUILD_LEVEL_SELECT && !game.fullRunCompleted ? 'BUILD LEVEL SELECT' : 'LEVEL SELECT';
    levelSelectBox.innerHTML = `<div class="level-select-title">${titleText}</div><div class="level-select-grid"></div>`;
    const grid = levelSelectBox.querySelector('.level-select-grid');
    for (const level of LEVELS) {
      const button = document.createElement('button');
      button.className = 'level-pick';
      const best = game.bestTimes[level.number - 1];
      button.innerHTML = `<strong>L${level.number}<br>${level.name}</strong><span>${best ? formatTime(best) : 'NO BEST'}</span>`;
      button.addEventListener('click', () => {
        overlay.classList.remove('open');
        game.startLevel(level.number);
      });
      grid.append(button);
    }
  }

  function showOverlay(mode) {
    overlay.classList.add('open');
    statsBox.classList.add('hidden');
    secondary.classList.add('hidden');
    body.classList.add('hidden');
    levelSelectBox.classList.add('hidden');
    if (mode === 'start') {
      title.innerHTML = 'Karambe Village<br>Water Run';
      subtitle.textContent = 'Three levels. Deliver three cans in each as fast as possible.';
      body.classList.remove('hidden');
      renderLevelSelect();
      primary.textContent = 'START FULL RUN';
      primaryAction = () => { overlay.classList.remove('open'); game.start(); };
    } else if (mode === 'pause') {
      title.textContent = `Paused — Level ${game.level}`;
      subtitle.textContent = `Stopwatch paused at ${formatTime(game.elapsed)}.`;
      renderLevelSelect();
      primary.textContent = 'RESUME';
      primaryAction = () => { overlay.classList.remove('open'); game.resume(); };
      secondary.classList.remove('hidden');
      secondary.textContent = game.runMode === 'single' ? `RESTART LEVEL ${game.level}` : 'RESTART FULL RUN';
      secondaryAction = () => {
        overlay.classList.remove('open');
        if (game.runMode === 'single') game.startLevel(game.level); else game.start();
      };
    } else if (mode === 'singleComplete') {
      const result = game.levelResults[game.level - 1];
      title.textContent = `Level ${game.level} Clear`;
      subtitle.textContent = `Three cans delivered in ${formatTime(result.time)}.`;
      statsBox.innerHTML = `
        <span>Level time</span><strong>${formatTime(result.time)}</strong>
        <span>Can 1</span><strong>${formatTime(result.splits[0])}</strong>
        <span>Can 2</span><strong>${formatTime(result.splits[1])}</strong>
        <span>Can 3</span><strong>${formatTime(result.splits[2])}</strong>
        <span>Retries</span><strong>${result.retries}</strong>
        <span>Best</span><strong>${formatTime(game.bestTimes[game.level - 1])}</strong>`;
      statsBox.classList.remove('hidden');
      renderLevelSelect();
      primary.textContent = `RUN LEVEL ${game.level} AGAIN`;
      primaryAction = () => { overlay.classList.remove('open'); game.startLevel(game.level); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'START FULL RUN';
      secondaryAction = () => { overlay.classList.remove('open'); game.start(); };
    } else if (mode === 'levelComplete') {
      const next = LEVELS[game.level];
      const result = game.levelResults[game.level - 1];
      title.textContent = `Level ${game.level} Clear`;
      subtitle.textContent = `Three cans delivered in ${formatTime(result.time)}.`;
      statsBox.innerHTML = `
        <span>Level time</span><strong>${formatTime(result.time)}</strong>
        <span>Can 1</span><strong>${formatTime(result.splits[0])}</strong>
        <span>Can 2</span><strong>${formatTime(result.splits[1])}</strong>
        <span>Can 3</span><strong>${formatTime(result.splits[2])}</strong>
        <span>Retries</span><strong>${result.retries}</strong>
        <span>Best</span><strong>${formatTime(game.bestTimes[game.level - 1])}</strong>
        <span>Next</span><strong>${game.level + 1}: ${next.name}</strong>`;
      statsBox.classList.remove('hidden');
      primary.textContent = `START LEVEL ${game.level + 1}`;
      primaryAction = () => { overlay.classList.remove('open'); game.advanceLevel(); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'RESTART FULL RUN';
      secondaryAction = () => { overlay.classList.remove('open'); game.start(); };
    } else if (mode === 'over') {
      const l1 = game.levelResults[0];
      const l2 = game.levelResults[1];
      const l3 = game.levelResults[2];
      title.textContent = 'Water Run Complete';
      subtitle.textContent = `Nine cans delivered in ${formatTime(game.totalTime)}.`;
      statsBox.innerHTML = `
        <span>Level 1</span><strong>${formatTime(l1?.time)}</strong>
        <span>Level 2</span><strong>${formatTime(l2?.time)}</strong>
        <span>Level 3</span><strong>${formatTime(l3?.time)}</strong>
        <span>Total time</span><strong>${formatTime(game.totalTime)}</strong>
        <span>Total retries</span><strong>${game.stats.retries}</strong>
        <span>Rocks blocked</span><strong>${game.stats.rocks}</strong>
        <span>Snakes squashed</span><strong>${game.stats.snakes}</strong>
        <span>Best total</span><strong>${formatTime(game.bestTotal)}</strong>`;
      statsBox.classList.remove('hidden');
      renderLevelSelect();
      primary.textContent = 'RUN ALL LEVELS AGAIN';
      primaryAction = () => { overlay.classList.remove('open'); game.start(); };
      secondary.classList.remove('hidden');
      secondary.textContent = 'HOW TO PLAY';
      secondaryAction = () => showOverlay('start');
    }
    soundBtn.textContent = `SOUND: ${game.sound.enabled ? 'ON' : 'OFF'}`;
  }

  soundBtn.addEventListener('click', () => {
    game.sound.setEnabled(!game.sound.enabled);
    if (game.sound.enabled) game.sound.unlock();
    soundBtn.textContent = `SOUND: ${game.sound.enabled ? 'ON' : 'OFF'}`;
  });

  $('menuBtn').addEventListener('click', () => {
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

  const controls = createGameControls(game, { showOverlay });
  game.controls = controls;
  game.cancelControlTouches = (reason) => controls.releaseAll(reason);
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
      uniqueContacts: new Set(contacts.map(p => p.identifier)).size === contacts.length,
      uniqueControls: new Set(contacts.map(p => p.controlId)).size === contacts.length,
      standalone: !document.querySelector('script[src],link[rel="stylesheet"]')
    };
    return { pass: Object.values(checks).every(Boolean), buildId: BUILD_ID, checks };
  };
  if (BUILD_LEVEL_SELECT) window.CR.controls = controls;
  const pauseWhenHidden = () => {
    controls.releaseAll('hidden');
    if (game.state === 'playing') { game.pause(); showOverlay('pause'); }
  };
  window.addEventListener('blur', pauseWhenHidden);
  window.addEventListener('pagehide', pauseWhenHidden);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenHidden(); });
  window.addEventListener('resize', () => { game.resize(); if (innerWidth > innerHeight && innerHeight < 520) pauseWhenHidden(); });
  new ResizeObserver(() => game.resize()).observe($('stage'));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  showOverlay('start');
})();

