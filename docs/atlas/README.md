# Karambe game diagrams

Open [gameplay.html](gameplay.html) for the can loop, route rules, hazards, retry, stopwatch and progress sun. Open [runtime.html](runtime.html) for input ownership, simulation, feedback, persistence and packaging. Each viewer includes three guided views, search, zoom and light/dark themes.

These are native Archify architecture specifications and local HTML exports produced with the installed Atlas-pinned Archify **2.16.0** engine. The installed Atlas skill provides checkout briefs, bindings and factual checkpoints; it has no repository diagram-registration convention. Therefore these live under `docs/atlas/` as repository documentation. They are **not accepted Atlas workspace artifacts**. No Atlas project registration, automatic checkpoint opt-in, source pin, or acceptance record is implied.

The stock viewer's optional Google font links were removed in separate offline derivatives by [offline-export.mjs](offline-export.mjs). No diagram content, geometry or viewer logic was changed. [export-record.json](export-record.json) records separate native and offline SHA-256 values. The original delivered bytes and raw machine-path-bearing receipts remain in ignored `test-results/atlas/`; they are not public repository material.

## Reading the map

Arrow labels state important transitions and ownership. Cards provide the relationships intentionally left out of the edge map to avoid tangled lines. In the native architecture palette, “backend” means local game logic and “database” means in-memory records or device storage; there is no game server or network database.

- `src/game.js`: `Game`, movement and connector state, can interactions, hazard updates, `resetCurrentCan`, `deliverCan`, `currentLevelProgress`, level timing and full-run unlock. A retry preserves `levelCans`, `elapsed`, splits and banked progress while rebuilding the current attempt.
- `src/controls.ts`: `createGameControls` adapts `createMobileControls` from the pinned `vendor/sfhs/mobile-controls` runtime. SFHS owns contacts and `data-control-active`; product code owns CAN transactions, game actions and cancellation policy. Keyboard intent joins this adapter; the diagram's first row summarizes both input paths rather than claiming the SFHS pointer runtime owns keyboard events.
- `src/audio.js`: product-local `SoundBank`; synthesized effects/music and sound preference. Simulation produces sound events; persistence also receives best times and the sequential full-clear flag from `Game` (these non-audio writes are stated here instead of adding crossed arrows).
- `src/game.html`: canonical HTML/CSS shell. `tools/build.mjs` uses esbuild to inline shell, game, audio and vendored controls into root `index.html`, the distributed game.

The gameplay map deliberately separates the bank from the current can: delivery increments the bank, third delivery stops the timer, and a failed attempt only rolls the sun back to that can's segment. The arrows between levels summarize full-run order; device persistence stores the unlock only after the full sequential clear. Rock and snake eligibility remains tied to route/platform/connector state, not just visual overlap.

## Reproduce

Use the engine path configured by the local Atlas installation as `$archifyCli`; do not put a machine-specific path into repository configuration. For each `gameplay` and `runtime` view:

```powershell
node $archifyCli validate architecture docs/atlas/gameplay.architecture.json --quality showcase --json
node $archifyCli deliver architecture docs/atlas/gameplay.architecture.json test-results/atlas/gameplay.native.html --quality showcase --json
# Repeat both commands with runtime in place of gameplay.
node docs/atlas/offline-export.mjs
```

Both native specifications passed all nine showcase checks with zero composition errors and warnings, and native delivery succeeded. The final offline derivatives passed Archify's Chromium containment checks at 1440×900, 1600×1000, 1920×1080 and 2048×1320 in both themes. Small/large screenshots were inspected for readable labels, clear routes and complete cards. Standalone Chromium smoke found zero unexpected network requests and zero JavaScript errors for both offline views. See [verification.json](verification.json) for the portable summary. This is diagram engineering evidence, not game or physical Android acceptance. Atlas's separate six-gate accepted-artifact workflow and full interactive viewer acceptance were not run.
