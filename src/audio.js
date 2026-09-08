  // Original synthesized score and effects: no recordings or external assets.
  class SoundBank {
    constructor() {
      this.ctx = null;
      this.master = null;
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
          this.master.gain.value = .68;
          this.master.connect(this.ctx.destination);
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
    tone(freq = 440, duration = .08, type = 'square', gain = .045, endFreq = null, delay = 0) {
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
      osc.connect(amp).connect(this.master);
      this.track(osc, amp, at, duration);
    }
    noise(duration = .12, gain = .035, delay = 0) {
      if (!this.available()) return;
      const at = this.ctx.currentTime + Math.max(0, delay);
      const n = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 19429;
      for (let i = 0; i < n; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / n);
      }
      const source = this.ctx.createBufferSource();
      const amp = this.ctx.createGain();
      source.buffer = buffer; amp.gain.setValueAtTime(gain, at);
      source.connect(amp).connect(this.master);
      this.track(source, amp, at, duration);
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
      const spacing = 60 / [108, 116, 124][this.level - 1] / 2;
      if (!this.nextBeat || this.nextBeat < now - .15) this.nextBeat = now + .015;
      // Frame-driven 85 ms lookahead; never a timer or a catch-up storm.
      for (let count = 0; count < 2 && this.nextBeat < now + .085; count++) {
        const delay = Math.max(0, this.nextBeat - now);
        const phrase = [0, 7, 12, 9, 7, 4, 2, 7, 0, 4, 9, 12, 7, 2, 4, 7];
        const roots = [48, 53, 55, 48];
        const root = roots[Math.floor(this.beat / 16) % roots.length];
        const note = root + 12 + phrase[this.beat % phrase.length];
        const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
        if (this.beat % 2 === 0 || this.level > 1) {
          this.tone(hz(note), .16, 'triangle', .026, null, delay); this.diagnostics.musicNotes++;
        }
        if (this.beat % 4 === 0) {
          this.tone(hz(root - 12), .25, 'sine', .048, null, delay);
          this.tone(110, .11, 'sine', .037, 45, delay);
        }
        if (this.beat % 4 === 2) this.noise(.045, .014, delay);
        if (this.level === 3 && this.beat % 2 === 1) this.noise(.022, .008, delay);
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
    block() { this.noise(.06, .04); this.tone(220, .09, 'square', .04, 95); }
    hit() { this.noise(.14, .045); this.tone(90, .18, 'sawtooth', .035, 55); }
    stomp() { this.tone(165, .08, 'square', .04, 80); }
    crack() { this.noise(.16, .04); }
    sunset() { this.tone(220, .45, 'triangle', .045, 110); }
    step() { this.limited('step', .17, () => this.noise(.025, .011)); }
    land() { this.limited('land', .1, () => this.tone(95, .07, 'triangle', .03, 55)); }
    retry() { this.tone(196, .07, 'triangle', .04); this.tone(294, .09, 'triangle', .035, null, .08); }
    menu() { this.tone(392, .045, 'sine', .035, 520); }
    rolling() { this.limited('rolling', .24, () => this.noise(.055, .009)); }
    collapse() { this.noise(.25, .048); this.tone(120, .24, 'triangle', .04, 35); }
    crush() { this.noise(.07, .025); this.tone(185, .1, 'triangle', .05, 65); }
    clear() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, .2, 'triangle', .04, null, i * .085)); }
  }
