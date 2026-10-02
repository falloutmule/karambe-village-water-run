  import soundtrackUrl from './assets/karambe-village.mp3';
  // Full user-supplied soundtrack, embedded at build time. Effects remain synthesized locally.
  const MAX_MASTER_GAIN = 6;
  export class SoundBank {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.limiter = null;
      this.peakGuard = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.noiseBuffer = null;
      this.soundtrack = document.getElementById('soundtrack');
      this.soundtrackSource = null;
      this.soundtrackPending = false;
      this.soundtrackBlocked = false;
      this.enabled = true;
      this.volume = 1;
      try {
        this.enabled = localStorage.getItem('karambe-audio-enabled') !== '0';
        const storedVolume = Number.parseFloat(localStorage.getItem('karambe-audio-volume'));
        if (Number.isFinite(storedVolume)) this.volume = Math.min(1, Math.max(.1, storedVolume));
      } catch {}
      this.voices = new Set();
      this.playing = false;
      this.level = 1;
      this.cooldowns = new Map();
      this.diagnostics = { unlocks: 0, scheduled: 0, sfxVoices: 0, controlCues: 0, activeVoices: 0, playing: false, enabled: this.enabled, volume: this.volume, level: 1, contextState: 'unavailable', lastUnlockError: '', soundtrackStarts: 0, soundtrackPlaying: false, soundtrackTime: 0, soundtrackDuration: 0, soundtrackError: '' };
      this.soundtrack.addEventListener('playing', () => {
        this.diagnostics.soundtrackStarts++;
        this.diagnostics.soundtrackPlaying = true;
      });
      this.soundtrack.addEventListener('pause', () => { this.diagnostics.soundtrackPlaying = false; });
      this.soundtrack.addEventListener('loadedmetadata', () => { this.diagnostics.soundtrackDuration = this.soundtrack.duration; });
      this.soundtrack.addEventListener('error', () => {
        this.soundtrackBlocked = true;
        this.diagnostics.soundtrackError = `Media error ${this.soundtrack.error?.code || 'unknown'}`;
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.stopAll(); this.playing = false; this.diagnostics.playing = false; }
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
          this.limiter = this.ctx.createDynamicsCompressor();
          this.peakGuard = this.ctx.createWaveShaper();
          this.musicBus = this.ctx.createGain();
          this.sfxBus = this.ctx.createGain();
          this.master.gain.value = this.enabled ? MAX_MASTER_GAIN * this.volume : 0;
          this.limiter.threshold.value = -1;
          this.limiter.knee.value = 0;
          this.limiter.ratio.value = 20;
          this.limiter.attack.value = .003;
          this.limiter.release.value = .12;
          // Compressor attack can pass brief overshoots. A smooth knee caps the final signal at .95.
          const peakCurve = new Float32Array(2049);
          for (let i = 0; i < peakCurve.length; i++) {
            const value = i * 2 / (peakCurve.length - 1) - 1;
            const magnitude = Math.abs(value);
            const knee = Math.max(0, (magnitude - .9) / .1);
            peakCurve[i] = Math.sign(value) * (magnitude <= .9 ? magnitude : .9 + .1 * (knee - knee * knee / 2));
          }
          this.peakGuard.curve = peakCurve;
          this.musicBus.gain.value = .72;
          this.sfxBus.gain.value = 1;
          this.musicBus.connect(this.master);
          this.sfxBus.connect(this.master);
          this.master.connect(this.limiter);
          this.limiter.connect(this.peakGuard).connect(this.ctx.destination);
          this.soundtrackSource = this.ctx.createMediaElementSource(this.soundtrack);
          this.soundtrackSource.connect(this.musicBus);
          this.soundtrack.src = soundtrackUrl;
          const size = this.ctx.sampleRate;
          this.noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          let seed = 19429;
          for (let i = 0; i < size; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 4294967296) * 2 - 1; }
          this.diagnostics.unlocks++;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        this.diagnostics.contextState = this.ctx.state;
        this.diagnostics.lastUnlockError = '';
        this.soundtrackBlocked = false;
        this.playSoundtrack();
      } catch (error) {
        this.diagnostics.lastUnlockError = error instanceof Error ? error.message : String(error);
      }
    }
    setEnabled(value) {
      this.enabled = Boolean(value);
      this.diagnostics.enabled = this.enabled;
      try { localStorage.setItem('karambe-audio-enabled', this.enabled ? '1' : '0'); } catch {}
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        const gain = this.enabled ? MAX_MASTER_GAIN * this.volume : 0;
        this.master.gain.value = gain;
        this.master.gain.setValueAtTime(gain, this.ctx.currentTime);
      }
      if (!this.enabled) this.stopAll();
    }
    setVolume(value) {
      this.volume = Math.min(1, Math.max(.1, Number(value) || 1));
      this.diagnostics.volume = this.volume;
      try { localStorage.setItem('karambe-audio-volume', this.volume.toFixed(2)); } catch {}
      if (this.master && this.ctx) {
        const gain = this.enabled ? MAX_MASTER_GAIN * this.volume : 0;
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.value = gain;
        this.master.gain.setValueAtTime(gain, this.ctx.currentTime);
      }
    }
    stopAll() {
      this.soundtrack.pause();
      this.diagnostics.soundtrackPlaying = false;
      for (const voice of [...this.voices]) {
        try { voice.source.stop(); } catch {}
        voice.source.disconnect(); voice.amp.disconnect();
      }
      this.voices.clear();
      this.diagnostics.activeVoices = 0;
    }
    available() { return this.enabled && !document.hidden && this.ctx?.state === 'running' && this.voices.size < 48; }
    track(source, amp, at, duration, category) {
      const voice = { source, amp };
      this.voices.add(voice);
      this.diagnostics.scheduled++;
      this.diagnostics[category]++;
      this.diagnostics.activeVoices = this.voices.size;
      source.onended = () => {
        source.disconnect(); amp.disconnect(); this.voices.delete(voice);
        this.diagnostics.activeVoices = this.voices.size;
      };
      source.start(at); source.stop(at + duration + .025);
      return true;
    }
    tone(freq = 440, duration = .08, type = 'square', gain = .045, endFreq = null, delay = 0) {
      if (!this.available()) return false;
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
      osc.connect(amp).connect(this.sfxBus);
      return this.track(osc, amp, at, duration, 'sfxVoices');
    }
    noise(duration = .12, gain = .035, delay = 0) {
      if (!this.available()) return false;
      const at = this.ctx.currentTime + Math.max(0, delay);
      const source = this.ctx.createBufferSource();
      const amp = this.ctx.createGain();
      source.buffer = this.noiseBuffer;
      amp.gain.setValueAtTime(Math.max(.0001, gain), at);
      amp.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.025, duration));
      source.connect(amp).connect(this.sfxBus);
      return this.track(source, amp, at, duration, 'sfxVoices');
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
    startMusic(restart = false) {
      if (restart) {
        this.stopAll();
        this.soundtrack.currentTime = 0;
        this.diagnostics.soundtrackTime = 0;
      }
      this.playing = true;
      this.diagnostics.playing = this.enabled && !document.hidden;
      this.unlock();
    }
    playSoundtrack() {
      if (!this.playing || !this.enabled || document.hidden || !this.ctx || this.soundtrackBlocked || this.soundtrackPending || !this.soundtrack.paused) return;
      this.soundtrackPending = true;
      this.soundtrack.play().then(() => {
        this.diagnostics.soundtrackError = '';
        if (!this.playing || !this.enabled || document.hidden) this.soundtrack.pause();
      }).catch(error => {
        // A pause/reset may abort an in-flight start. The next active frame can retry it.
        if (error.name !== 'AbortError') {
          this.soundtrackBlocked = true;
          this.diagnostics.soundtrackError = error instanceof Error ? error.message : String(error);
        }
      }).finally(() => { this.soundtrackPending = false; });
    }
    tick(dt, { playing = false, level = 1 } = {}) {
      const active = Boolean(playing && this.enabled && !document.hidden);
      const nextLevel = Math.max(1, Math.min(3, level || 1));
      if (this.playing && !active) this.stopAll();
      this.level = nextLevel; this.playing = active;
      this.diagnostics.playing = active; this.diagnostics.level = this.level;
      this.diagnostics.contextState = this.ctx?.state || 'unavailable';
      this.diagnostics.soundtrackTime = this.soundtrack.currentTime;
      if (active) this.playSoundtrack();
    }
    jump() { this.tone(235, .11, 'square', .032, 420); }
    // Imaginarium plastic-click cue: a short high-to-low sine snap with a quiet noise edge.
    controlPress(retryAfterResume = true) {
      if (!this.enabled || document.hidden || !this.ctx) return;
      if (retryAfterResume && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => this.controlPress(false)).catch(() => {});
        return;
      }
      if (!this.available()) return;
      const tone = this.tone(920, .065, 'sine', .032, 270);
      const noise = this.noise(.045, .007);
      if (tone || noise) this.diagnostics.controlCues++;
    }
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
