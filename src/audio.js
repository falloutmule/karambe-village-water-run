  // Original West African pop chiptune-inspired score and effects: no recordings or external assets.
  const SCORE_ROOTS = [48, 53, 55, 50];
  const SCORE_LEAD = [12,null,19,16,null,14,12,null,9,null,12,14,16,null,19,21,19,null,16,14,null,12,9,null,7,9,null,12,14,null,12,9];
  const SCORE_REPLY = [null,7,null,9,12,null,9,null,null,4,null,7,9,null,7,null];
  class SoundBank {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.noiseBuffer = null;
      this.enabled = true;
      try { this.enabled = localStorage.getItem('karambe-audio-enabled') !== '0'; } catch {}
      this.voices = new Set();
      this.playing = false;
      this.level = 1;
      this.nextBeat = 0;
      this.beat = 0;
      this.cooldowns = new Map();
      this.diagnostics = { unlocks: 0, scheduled: 0, musicNotes: 0, steps: 0, activeVoices: 0, playing: false, enabled: this.enabled, level: 1 };
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.stopAll(); this.playing = false; this.diagnostics.playing = false; this.nextBeat = 0; }
      });
    }
    // Call only from direct gesture handlers. Synthesis never opens audio.
    unlock() {
      if (!this.enabled || document.hidden) return;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.musicBus = this.ctx.createGain();
          this.sfxBus = this.ctx.createGain();
          this.master.gain.value = .68;
          this.musicBus.gain.value = .72;
          this.sfxBus.gain.value = 1;
          this.musicBus.connect(this.master);
          this.sfxBus.connect(this.master);
          this.master.connect(this.ctx.destination);
          const size = this.ctx.sampleRate;
          this.noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          let seed = 19429;
          for (let i = 0; i < size; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 4294967296) * 2 - 1; }
          this.diagnostics.unlocks++;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch { /* Silence is a supported fallback. */ }
    }
    setEnabled(value) {
      this.enabled = Boolean(value);
      this.diagnostics.enabled = this.enabled;
      try { localStorage.setItem('karambe-audio-enabled', this.enabled ? '1' : '0'); } catch {}
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.value = this.enabled ? .68 : 0;
        this.master.gain.setValueAtTime(this.enabled ? .68 : 0, this.ctx.currentTime);
      }
      if (!this.enabled) this.stopAll();
      this.nextBeat = 0;
    }
    stopAll() {
      for (const voice of [...this.voices]) {
        try { voice.source.stop(); } catch {}
        voice.source.disconnect(); voice.amp.disconnect();
      }
      this.voices.clear();
      this.diagnostics.activeVoices = 0;
    }
    available() { return this.enabled && !document.hidden && this.ctx?.state === 'running' && this.voices.size < 48; }
    track(source, amp, at, duration) {
      const voice = { source, amp };
      this.voices.add(voice);
      this.diagnostics.scheduled++;
      this.diagnostics.activeVoices = this.voices.size;
      source.onended = () => {
        source.disconnect(); amp.disconnect(); this.voices.delete(voice);
        this.diagnostics.activeVoices = this.voices.size;
      };
      source.start(at); source.stop(at + duration + .025);
    }
    tone(freq = 440, duration = .08, type = 'square', gain = .045, endFreq = null, delay = 0, music = false) {
      if (!this.available()) return;
      const at = this.ctx.currentTime + Math.max(0, delay);
      duration = Math.max(.025, duration);
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), at);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), at + duration);
      amp.gain.setValueAtTime(.0001, at);
      amp.gain.exponentialRampToValueAtTime(Math.max(.0001, gain), at + .006);
      amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(amp).connect(music ? this.musicBus : this.sfxBus);
      this.track(osc, amp, at, duration);
    }
    noise(duration = .12, gain = .035, delay = 0, music = false) {
      if (!this.available()) return;
      const at = this.ctx.currentTime + Math.max(0, delay);
      const source = this.ctx.createBufferSource();
      const amp = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      amp.gain.setValueAtTime(Math.max(.0001, gain), at);
      amp.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.025, duration));
      source.connect(amp).connect(music ? this.musicBus : this.sfxBus);
      this.track(source, amp, at, duration);
    }
    duckMusic(amount = .42, duration = .18) {
      if (!this.musicBus || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
      this.musicBus.gain.linearRampToValueAtTime(amount, now + .025);
      this.musicBus.gain.linearRampToValueAtTime(.72, now + duration);
    }
    limited(name, interval, effect) {
      if (!this.available()) return;
      const now = this.ctx.currentTime;
      if (now < (this.cooldowns.get(name) || 0)) return;
      this.cooldowns.set(name, now + interval); effect();
    }
    tick(dt, { playing = false, level = 1 } = {}) {
      const active = Boolean(playing && this.enabled && !document.hidden);
      const nextLevel = Math.max(1, Math.min(3, level || 1));
      if (this.playing && !active) this.stopAll();
      if (nextLevel !== this.level) { this.beat = 0; this.nextBeat = 0; }
      this.level = nextLevel; this.playing = active;
      this.diagnostics.playing = active; this.diagnostics.level = this.level;
      if (!active || !this.available()) { this.nextBeat = 0; return; }
      const now = this.ctx.currentTime;
      const spacing = 60 / [110, 118, 126][this.level - 1] / 4;
      if (!this.nextBeat || this.nextBeat < now - .15) this.nextBeat = now + .015;
      // Frame-driven 85 ms lookahead; never a timer or a catch-up storm.
      for (let count = 0; count < 2 && this.nextBeat < now + .085; count++) {
        const delay = Math.max(0, this.nextBeat - now);
        const root = SCORE_ROOTS[Math.floor(this.beat / 16) % SCORE_ROOTS.length];
        const lead = SCORE_LEAD[this.beat % SCORE_LEAD.length];
        const reply = SCORE_REPLY[this.beat % SCORE_REPLY.length];
        const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
        if (lead !== null && (this.beat % 2 === 0 || this.level > 1)) {
          this.tone(hz(root + lead), .105, this.level === 1 ? 'triangle' : 'square', .018, null, delay, true); this.diagnostics.musicNotes++;
        }
        if (reply !== null && this.level >= 2 && this.beat % 2 === 1) {
          this.tone(hz(root + 24 + reply), .065, 'square', .009, null, delay, true);
        }
        if (this.beat % 8 === 0 || this.beat % 8 === 5) this.tone(hz(root - 12), .19, 'triangle', .034, null, delay, true);
        if (this.beat % 8 === 0 || this.beat % 8 === 6) this.tone(105, .07, 'sine', .027, 48, delay, true);
        if (this.beat % 4 === 2 || this.beat % 8 === 7) this.noise(.028, .009, delay, true);
        if (this.level === 3 && this.beat % 2 === 1) this.noise(.014, .0045, delay, true);
        this.beat++; this.diagnostics.steps++; this.nextBeat += spacing;
      }
    }
    jump() { this.tone(235, .11, 'square', .032, 420); }
    noJump() { this.limited('warning', .35, () => this.tone(115, .12, 'triangle', .05, 75)); }
    pickup() { this.tone(360, .07, 'square', .028, 510); }
    drop() { this.tone(145, .08, 'triangle', .045, 95); }
    fillTick() { this.tone(650, .035, 'sine', .022, 710); }
    filled() { this.tone(420, .12, 'triangle', .05, 720); this.tone(720, .14, 'triangle', .045, 930, .07); }
    pour() { this.tone(510, .13, 'sine', .045, 310); }
    score() { this.tone(520, .12, 'triangle', .05, 780); this.tone(780, .16, 'triangle', .045, 1040, .09); }
    block() { this.duckMusic(.48, .14); this.noise(.06, .04); this.tone(220, .09, 'square', .04, 95); }
    hit() { this.duckMusic(.34, .24); this.noise(.14, .045); this.tone(90, .18, 'sawtooth', .035, 55); }
    stomp() { this.tone(165, .08, 'square', .04, 80); }
    crack() { this.noise(.16, .04); }
    sunset() { this.tone(220, .45, 'triangle', .045, 110); }
    step() { this.limited('step', .17, () => this.noise(.025, .011)); }
    land() { this.limited('land', .1, () => this.tone(95, .07, 'triangle', .03, 55)); }
    retry() { this.duckMusic(.42, .2); this.tone(196, .07, 'triangle', .04); this.tone(294, .09, 'triangle', .035, null, .08); }
    menu() { this.tone(392, .045, 'sine', .035, 520); }
    rolling() { this.limited('rolling', .24, () => this.noise(.055, .009)); }
    collapse() { this.noise(.25, .048); this.tone(120, .24, 'triangle', .04, 35); }
    crush() { this.noise(.07, .025); this.tone(185, .1, 'triangle', .05, 65); }
    clear() { this.duckMusic(.3, .42); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, .2, 'triangle', .04, null, i * .085)); }
  }
