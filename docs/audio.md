# Soundtrack and effects

The game plays the full user-supplied **Karambe Village** song by falloutmule.
Canonical asset: `src/assets/karambe-village.mp3`, copied without transcoding from
`Karambe Village (16,85).mp3`. The track lasts approximately 4 minutes 36 seconds.
Its byte identity and duration are recorded in `src/build-manifest.json`.

The build embeds those exact MP3 bytes as a data URL in root `index.html`.
Playback uses one HTML audio element routed through the existing Web Audio music
bus, avoiding a full-song PCM allocation on phones. No external asset request is
required. The offline download contains the song as well as the game.

## Playback

- START FULL RUN, a new single-level run, and restart rewind the song to its intro.
- The song loops when it reaches the end. Advancing to the next level continues
  from the current position.
- Opening the menu, completing a level, hiding the page, and pagehide pause the
  song immediately. RESUME continues from the paused position.
- SOUND OFF pauses music and cancels active effects. Turning sound back on and
  resuming gameplay continues the song. Stored mute and volume preferences remain
  under `karambe-audio-enabled` and `karambe-audio-volume`.
- The menu's 10–100% volume slider controls the common output. Maximum gain is
  6, followed by peak compression starting at −1 dB and a final smooth peak guard
  capped at .95. This raises both music and
  effects relative to the former 1.5 gain / −6 dB mix. Music remains on a separate bus so block,
  hit, retry, and completion effects can duck it briefly.
- Audio and the song source initialize after a gesture; page load and a muted
  reload initialize neither. Playback failures fall back to silence and are
  reported in diagnostics.

Gameplay effects and the optional clicky-control cue remain locally synthesized.
The former procedural music sequencer has been removed. Effects use a reusable
deterministic noise buffer, never consume gameplay randomness, and have a
48-voice limit with cleanup on completion and cancellation.

## Integration and evidence

`SoundBank.startMusic(restart)` owns new-run versus continuation behavior.
`tick(dt, { playing, level })` synchronizes playback with gameplay; `stopAll()`
pauses the song and cancels effects. `unlock()` creates/resumes the context in
gesture paths. No music timers are required.

Diagnostics include `soundtrackStarts`, `soundtrackPlaying`, `soundtrackTime`,
`soundtrackDuration`, and `soundtrackError`, alongside the existing effect and
context counters. An advancing media clock proves playback timing; the focused
soundtrack test also measures nonzero signal at the actual master output.

`npm run test:soundtrack` checks exact asset bytes/hash, decoded duration, audio
output, pause/resume, mute/volume, new-run reset, level continuation, the actual
end-to-intro loop, pagehide, interrupted play recovery, and the downloaded file
with networking disabled. Live Pages verification confirms exact artifact bytes
and that the full embedded song starts and pauses on the published phone page.
These checks verify browser behavior, not subjective speaker balance on Samsung.
The full stereo song is also rendered through both the former and current output
paths to measure the increase in RMS level and check every sample for clipping.
Concurrent control, hit, and completion effects are sampled through the live output.
Build `karambe-soundtrack2` measures a 5.06 dB full-track RMS increase compared
with the same song through the former gain/limiter settings. The maximum measured
sample is .95, with zero samples at or beyond digital full scale.

This card guards Hermes failure modes A–G and P–T through standalone/parity,
network, lifecycle, audio-output, release, and deployment checks. Mobile layout
and controls remain covered by their existing lanes; custom control editing is
outside this card.
