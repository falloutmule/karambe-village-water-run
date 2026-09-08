# Original procedural audio

`src/audio.js` synthesizes every sound locally with Web Audio. The melody, harmony, rhythmic pattern, and effects are newly authored for this game. No recordings, sampled music, external assets, or traditional/culturally authentic music claims are involved.

A four-root harmonic cycle supports a sixteen-note motif. L1 uses a spacious 108 BPM arrangement; L2 adds alternating melody notes at 116 BPM; L3 adds light offbeat percussion at 124 BPM. Modest master gain and quiet accompaniment prioritize gameplay cues.

## Integration

- Call `unlock()` only inside direct user-gesture handlers. Neither synthesis nor `tick` creates or resumes an AudioContext.
- Use `setEnabled(boolean)` for mute. It stores `karambe-audio-enabled`, controls master gain, and immediately cancels active/queued voices. After enabling from a click, call `unlock()`.
- Call `tick(dt, { playing, level })` every animation frame, including menus. The first inactive tick stops voices. Hidden-document handling cancels immediately. No intervals or timeout callbacks are used.
- Existing methods remain compatible. Added effects: step, land, retry, menu, rolling, collapse, crush, clear. Step/rolling use audio-clock rate limits.
- Call `stopAll()` on immediate pause/reset if a frame may not run promptly. Play a final clear effect after music stops. Scheduled SFX notes cancel with music.

The sequencer schedules at most two eighth-note steps per frame with an 85 ms lookahead. Delayed frames reset scheduling instead of replaying missed notes. Voices are bounded at 48 and disconnect when ended. Deterministic noise does not consume the gameplay random stream. Audio creation failures fall back to silence.

`sound.diagnostics` exposes unlocks, scheduled, musicNotes, steps, activeVoices, playing, enabled, and level. Use these with AudioContext state and persisted settings to verify initialization, progression, cancellation, and mute. Counters prove scheduling behavior; listening and physical phone checks remain separate.

## Focused verification

Chrome headless verified that tone/noise/tick before unlock leave the AudioContext null; a button gesture creates one context; music schedules across all three levels; all added SFX schedule without exceptions; inactive tick cancels 17 queued/active voices to zero; muted effects schedule no voices; a new SoundBank reads the stored mute preference; and mute sets master gain to zero. Source syntax passes `node --check`. This is scheduling/lifecycle verification, not a listening verdict.
