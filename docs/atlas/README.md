# Karambe game diagrams

Open [gameplay.html](gameplay.html) for the can loop, route rules, hazards, retry, stopwatch and progress sun. Open [runtime.html](runtime.html) for input ownership, simulation, feedback, persistence and packaging. Each viewer includes three guided views, search, zoom and light/dark themes.

This checkout is explicitly bound to the Atlas project `karambe-village-water-run`.
The authoritative gameplay model is Atlas trial
`trial-3bba5f1b-b28b-4316-abaf-ac455b1a2c42`, pinned to source commit
`889759c86a087c02183920c616779837a969d69c`. Atlas independently passed its
evidence lock, nine-check showcase validation, delivery, source audit, and
visual capture/readability checks. It remains a delivered candidate pending the
separate human comprehension review required for Atlas acceptance.

The files here are the portable source specification, evidence ledger, and local
offline reference exports. They do not replace the Atlas workspace record.

The stock viewer's optional Google font links were removed in separate offline derivatives by [offline-export.mjs](offline-export.mjs). No diagram content, geometry or viewer logic was changed. [export-record.json](export-record.json) records separate native and offline SHA-256 values. The original delivered bytes and raw machine-path-bearing receipts remain in ignored `test-results/atlas/`; they are not public repository material.

## Reading the map

Arrow labels state important transitions and ownership. Cards provide the relationships intentionally left out of the edge map to avoid tangled lines. In the native architecture palette, “backend” means local game logic and “database” means in-memory records or device storage; there is no game server or network database.

- `src/game.js`: `Game`, movement and connector state, can interactions, hazard updates, retry, delivery, and level timing. A retry preserves `levelCans`, `elapsed`, splits and banked progress while rebuilding the current attempt.
- `src/renderer.js`: static canvas layers and the complete read-only draw path. `src/loop.js` owns the fixed-step animation loop.
- `src/ui.js`: accessible dialog, gated Level Select, statistics, sound/install/menu actions, focus management and live announcements. `src/storage.js` validates and stores best times, best total and the permanent full-run unlock.
- `src/controls.ts`: product actions and keyboard/assistive input over the pinned `vendor/sfhs/mobile-controls` runtime. SFHS owns contacts, active visuals, release batching and the opt-in Android native Touch default suppression contract.
- `src/audio.js`: product-local synthesized effects/music, persisted sound preference and scheduling diagnostics. `src/main.js` composes the modules and exposes the read-only production self-check.
- `src/game.html`: canonical HTML/CSS shell. `tools/build.mjs` bundles the manifest entry and inlines it into root `index.html`, the distributed game.

The gameplay map deliberately separates the bank from the current can: delivery increments the bank, third delivery stops the timer, and a failed attempt only rolls the sun back to that can's segment. The arrows between levels summarize the required first full run; completing L1→L2→L3 permanently unlocks Level Select. Rock and snake eligibility remains tied to route/platform/connector state, not just visual overlap.

## Reproduce

Use the engine path configured by the local Atlas installation as `$archifyCli`; do not put a machine-specific path into repository configuration. For each `gameplay` and `runtime` view:

```powershell
node $archifyCli validate architecture docs/atlas/gameplay.architecture.json --quality showcase --json
node $archifyCli deliver architecture docs/atlas/gameplay.architecture.json test-results/atlas/gameplay.native.html --quality showcase --json
# Repeat both commands with runtime in place of gameplay.
node docs/atlas/offline-export.mjs
```

Both native specifications passed all nine showcase checks with zero composition errors and warnings, and native delivery succeeded. The final offline derivatives passed Chromium containment checks at 1440×900, 1600×1000, 1920×1080 and 2048×1320 in both themes. Small/large screenshots were inspected for readable labels, clear routes and complete cards. Standalone Chromium smoke found zero unexpected network requests and zero JavaScript errors for both offline views. See [verification.json](verification.json) for the portable summary. The bound Atlas gameplay trial adds a passing four-claim/eleven-source evidence receipt and a separate passing source audit. This is diagram engineering evidence, not game or physical Android acceptance.
