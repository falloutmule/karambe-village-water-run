# SFHS integration

The vendored mobile-controls source is copied without semantic edits from
`falloutmule/single-file-html-software` commit
`391ed3afe75fa47794e7e1e9f3477e3ec53ecb12`, fetched from origin/main during this task.
It is the actual production TypeScript runtime, not a reimplementation. Its MIT
license is retained in `vendor/sfhs/LICENSE`. The shared checkout had unrelated
dirty work and an older HEAD; vendor files were extracted from the fetched commit.

`src/controls.ts` maps the four established controls to SFHS `hold` primitives.
SFHS owns contact identity, simultaneous contacts, document release, cancel, lost
capture, lifecycle reset, normalized layouts, and active-contact feedback.
Gameplay actions are drained at the simulation update boundary. CAN taps require
an accepted release of their original owner inside the control; interruption
invalidates both pending actions and active CAN state. Keyboard aliases share a
single CAN transaction and are cleared on lifecycle reset.

Two product adapters are deliberate: SFHS `pulse` fires on press, so CAN uses a
validated hold/release transaction instead; SFHS holds can track outside their
rectangle, while this game cancels on leave by dispatching a targeted cancellation
through the native SFHS release route. No shared repository mutation was needed.

Current control-feedback-mobile-controls-dom was inspected. The native
`data-control-active` presentation already follows the exact authoritative owner
state and preserves the game's existing four-button appearance, so the additional
portable preset bridge would add no material benefit here. No separate visual
contact router is used.

The runtime's mount surface is the full visual viewport. Inert original buttons
retain the established responsive grid; generated SFHS controls use their measured
rectangles. Layout and safe-area changes cancel active contacts before relocation.
This adapter does not claim physical Android acceptance: device testing remains
separate from Chromium engineering evidence.
