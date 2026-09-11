  // SECTION constitution: INPUT -> ACTIONS -> SIMULATION -> RENDER.
  // Rendering never mutates gameplay or save state. Canonical source; generated index.html.
  // No eval, dynamic Function, inline handlers or external runtime dependencies.
export const BUILD_ID = __BUILD_ID__;
export const SAVE_VERSION = 1;

export const WORLD_W = 480;
export const WORLD_H = 860;
export const CANS_PER_LEVEL = 3;
export const DEV_MENU = new URLSearchParams(location.search).get('dev') === '1';
export const DEV_ACCESS = DEV_MENU && (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname));
export const ROCK_TOP_EXIT_X = 378;
export const FIXED_STEP = 1 / 120;
export const LEVELS = [
    { number: 1, name: 'WATER RUN', rocks: false, snakes: false },
    { number: 2, name: 'ROCKS', rocks: true, snakes: false },
    { number: 3, name: 'ROCKS + SNAKES', rocks: true, snakes: true }
  ];
export const ROCK_PATTERN = [
    { delay: 1.18, target: 270 },
    { delay: .92, target: 150 },
    { delay: .72, target: 305 },
    { delay: 1.04, target: 205 },
    { delay: .62, target: 245 },
    { delay: 1.16, target: 120 }
  ];
export const BRIDGE_X1 = 205;
export const BRIDGE_X2 = 315;
export const BOTTOM_PLATFORM = 5;
export const UPPER_BYPASS = 3;
export const LOWER_BYPASS = 4;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
export const rand = (a, b) => a + Math.random() * (b - a);
export const formatTime = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const centis = Math.floor((safe - Math.floor(safe)) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  };

export function mixColor(a, b, t) {
    const pa = a.match(/\d+/g).map(Number);
    const pb = b.match(/\d+/g).map(Number);
    return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
  }

export class Game {
    constructor({ sound, records }) {
      this.sound = sound;
      this.records = records;
      this.showOverlay = () => {};
      this.onScore = () => {};
      this.onStatus = () => {};
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
      ({ bestTimes: this.bestTimes, bestTotal: this.bestTotal, fullRunUnlocked: this.fullRunUnlocked } = this.records.load());
      this.runMode = 'full';
      this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionPreference.matches;
      this.motionPreference.addEventListener?.('change', event => { this.reducedMotion = event.matches; });
      this.reset();
    }

    attachRenderer(renderer) {
      this.renderer = renderer;
    }

    render() {
      this.renderer?.render();
    }

    resize() {
      this.renderer?.resize();
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
      if (this.message) this.onStatus(this.message);
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

    start() {
      this.runMode = 'full';
      this.reset();
      this.state = 'playing';
      this.last = performance.now();
      this.sound.unlock();
    }

    canSelectLevels() {
      return DEV_MENU || this.fullRunUnlocked;
    }

    startLevel(levelNumber) {
      if (!this.canSelectLevels()) return false;
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
      return true;
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
        this.onStatus(`PAUSED — LEVEL ${this.level}`);
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
      this.onStatus(`LEVEL ${this.level} COMPLETE`);
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
        this.records.saveBestTimes(this.bestTimes);
      }
      if (this.runMode === 'single') {
        this.state = 'singleComplete';
        this.showOverlay('singleComplete');
        return;
      }
      if (this.level < LEVELS.length) {
        this.state = 'between';
        this.showOverlay('levelComplete');
      } else {
        this.state = 'over';
        this.totalTime = this.levelResults.reduce((sum, item) => sum + (item?.time || 0), 0);
        if (!this.bestTotal || this.totalTime < this.bestTotal) {
          this.bestTotal = this.totalTime;
          this.records.saveBestTotal(this.bestTotal);
        }
        const completedSequentialRun = LEVELS.every((level, index) => this.levelResults[index]?.level === level.number);
        if (completedSequentialRun && !this.fullRunUnlocked) {
          this.fullRunUnlocked = true;
          this.records.saveFullRunUnlocked();
        }
        this.showOverlay('over');
        this.onStatus('WATER RUN COMPLETE');
      }
    }

    surfaceY(index, x) {
      const p = this.platforms[index];
      const t = clamp((x - p.x1) / (p.x2 - p.x1), 0, 1);
      return lerp(p.y1, p.y2, t);
    }

    bridgeIsOpenAt(x) {
      return this.bridge.state === 'collapsed' && x > BRIDGE_X1 && x < BRIDGE_X2;
    }

    update(dt) {
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
            this.onStatus(this.message);
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
        this.onStatus(this.message);
        this.messageTimer = 1.2;
        this.completeLevel();
        return;
      }
      this.canStartElapsed = this.elapsed;
      this.cancelControlTouches?.('can-delivered');
      this.resetCurrentCan(false, `CAN ${this.levelCans} DELIVERED — GO!`);
    }

    setScoreText() {
      this.onScore(`${this.levelCans}/${CANS_PER_LEVEL}`);
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
      this.resetCurrentCan(true, `${text} — CAN ${this.levelCans + 1}: GO!`);
      this.messageTimer = 1.4;
      this.addBurst(x, y - 24, 12, '#fff1a1');
      this.sound.retry();
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
      let write = 0;
      for (const q of this.particles) {
        q.life -= dt;
        q.vy += 150 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.life > 0) this.particles[write++] = q;
      }
      this.particles.length = write;
    }


  }
