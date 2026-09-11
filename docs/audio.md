# Original procedural audio

`src/audio.js` synthesizes every sound locally with Web Audio. The melody, harmony, rhythmic pattern, and effects are newly authored for this game. No recordings, sampled music, external assets, or traditional/culturally authentic music claims are involved.

A four-root harmonic cycle supports an original call-and-response theme. The score
uses syncopated percussion, interlocking chip-pluck figures and melodic triangle
bass: L1 is sparse at 110 BPM, L2 adds the response at 118 BPM, and L3 uses the
full rhythmic layer at 126 BPM. This is a broad stylistic influence, not a claim of
traditional or culturally authentic music.

Music and effects run through separate internal buses. Major block, hit, retry and
clear cues briefly duck the music. A reusable deterministic noise buffer avoids
allocating a new AudioBuffer for every step or rock sound.

## Integration

- Call `unlock()` only inside direct user-gesture handlers. Neither synthesis nor `tick` creates or resumes an AudioContext.
- Use `setEnabled(boolean)` for mute. It stores `karambe-audio-enabled`, controls master gain, and immediately cancels active/queued voices. After enabling from a click, call `unlock()`.
- Call `tick(dt, { playing, level })` every animation frame, including menus. The first inactive tick stops voices. Hidden-document handling cancels immediately. No intervals or timeout callbacks are used.
- Existing methods remain compatible. Added effects: step, land, retry, menu, rolling, collapse, crush, clear. Step/rolling use audio-clock rate limits.
- Call `stopAll()` on immediate pause/reset if a frame may not run promptly. Play a final clear effect after music stops. Scheduled SFX notes cancel with music.

The sequencer schedules at most two eighth-note steps per frame with an 85 ms lookahead. Delayed frames reset scheduling instead of replaying missed notes. Voices are bounded at 48 and disconnect when ended. Deterministic noise does not consume the gameplay random stream. Audio creation failures fall back to silence.

`sound.diagnostics` exposes unlocks, scheduled, musicNotes, musicNoise, sfxVoices, steps, activeVoices, playing, enabled, level, contextState, and the last unlock error. Use these to verify initialization, music/effect progression, cancellation, and mute. Counters prove scheduling behavior; listening and physical phone checks remain separate.

## Focused verification

Chrome headless verified that tone/noise/tick before unlock leave the AudioContext null; a button gesture creates one context; music schedules across all three levels; all added SFX schedule without exceptions; inactive tick cancels 17 queued/active voices to zero; muted effects schedule no voices; a new SoundBank reads the stored mute preference; and mute sets master gain to zero. Source syntax passes `node --check`. This is scheduling/lifecycle verification, not a listening verdict.
