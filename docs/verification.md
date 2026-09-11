# Engineering verification

Current candidate: `karambe-devmenu2`. Canonical input is `src/` plus its
build manifest; root `index.html` is generated and checked byte-for-byte. This document
records local engineering evidence, not a physical Android acceptance verdict.

## Starting point and scope

The current playable ZIP entry and historical V0.9 entry are identical, SHA-256
`a3943095ff88c2a5b6a6b99d422129c433ca8195374fea404eff058442cd2b15`.
The established board, player art, speeds, short empty route, long full route,
rock pattern/chute and three-can levels were continued from that source.
The historical ZIP and private phone screenshots are not published here.

Repairs include actual pinned SFHS contact ownership with a product CAN adapter;
instant current-can reset with cause-specific feedback; no backwards can placement;
immediate rock interception by placed cans; continuous fill-to-pour hold support;
exactly one retry when several hazards collide; permanent Level Select unlock
after the first sequential three-level clear; isolated development saves; fixed snake respawn times with safe
grace; original music/SFX and persisted mute; clearer instructions and larger HUD.

## Executed checks

- `npm run typecheck`, `npm run build` and `npm run build:check`: strict control-runtime typing, build parity and expanded standalone resource guards.
- `npm test`: 40 gameplay checks, including placement, jump restrictions, fill,
  pouring, checkpoint retry/timer/sun, bridge, snake stomp/crush/respawn, path
  collision identity, rock continuity, overlapping-hit retry, and render purity.
  An authored L1 route delivers all three cans without position teleportation.
- `npm run test:controls`: 152 assertions plus native Chromium CDP multitouch,
  long hold, cancellation and an unfrozen real-time loop. It covers ownership,
  event batching, every control with sound on/off, canceled/outside CAN,
  assistive timers, visual clearing, blur, visibility, viewport and transitions.
- `npm run test:release`: 57 checks for normal release boot, dialog focus/inert behavior, live status, locked first run, permanent sequential-clear unlock, isolated Dev Menu, persisted
  mute, audio gesture startup, all-level music, portrait control bounds, exact-byte
  download and standalone operation. A clearly identified fixture exposes game
  state for verification; normal release is tested separately.
- `npm run test:routes`: L2 and L3 each complete three cans twice, hazards active,
  zero retries, equal repeated elapsed times. Uses simulation inputs/actions;
  no teleports, invulnerability, hazard disabling, or speed changes. L2 blocks
  12 rocks; L3 blocks 18 rocks and squashes 6 snakes. This proves those authored
  routes are feasible, not that a human will achieve the automated times.
- `node tests/phone-access.mjs`: all controls with sound on/off, trusted Touch
  default cancellation, simultaneous contacts and clean release at 320×568,
  390×844 and 412×915, plus the exact downloaded offline artifact.
- Browser checks report no page errors, vibration requests or unexpected runtime requests.
- Atlas is the authoritative architecture record for this checkout. Its bound
  game diagram and review evidence are verified separately from the repo-local
  reference exports. Three fresh independent critic passes against successive
  states are recorded in `critic-pass-1-baseline-c218951.md`,
  `critic-pass-2-integration.md`, and `critic-pass-3-release.md`.

Raw run evidence is ignored under `test-results/`. CI recreates proofs, deploys
only `index.html`, then retries an exact-byte live Pages check and verifies the
production runtime. SFHS mobile-control runtime provenance is verified; this product
uses its own small esbuild packer, not an asserted SFHS certification pipeline.

The phone-polish render benchmark compares 300 direct L3 renders with the preserved
`7f411e8` artifact. Static scenery caching reduced `beginPath` calls from 40,200 to
9,300, strokes from 22,800 to 3,900, and fill rectangles from 33,300 to 6,600.
Those operation counts are stable evidence; the accompanying headless timing is
diagnostic rather than a physical-phone performance claim.

## Published artifact check

Every push now has separate test, deploy and live-verification jobs. The verifier
retries until the [Pages game](https://falloutmule.github.io/karambe-village-water-run/)
exactly matches committed `index.html`, then checks the read-only self-check,
fresh-install Level Select lock, isolated public Dev Menu, trusted Touch cancellation,
native CDP multitouch and pause UI. It records served bytes, SHA-256, retry
observations and runtime evidence in the workflow's `live-pages-proof` artifact.

## Phone-first testing access

The public and downloadable product is one `index.html`. A fresh device sees only
the complete-run option; finishing L1→L2→L3 once stores the permanent selector
unlock. `tests/phone-access.mjs` checks the locked release screen and controls at
320×568, 390×844 and 412×915, plus standalone development access. Set
`KARAMBE_LIVE=1` to compare deployed bytes with the local artifact.

## Haptic behavior

The game does not request device vibration. Gameplay controls use neutral `div`
touch surfaces with semantic keyboard proxies outside the touch targets. SFHS owns
contact release, cancel-on-leave and capture cleanup directly; no synthetic browser
cancellation events remain. Hold-callout, selection and drag defaults are suppressed.
The SFHS runtime owns opt-in suppression of the parallel native Touch Event defaults
throughout each control contact while retaining Pointer Events as the sole input
owner. It batches coalesced moves and multi-contact releases, publishes only state
changes, and updates both layouts atomically. Native CDP verifies that a long
multitouch hold remains owned and that trusted touch start, move, end and cancel
events reach the control root already canceled.
Browser automation cannot prove whether a specific phone adds hardware feedback;
that distinction requires physical Android Chrome testing.

## Limits and acceptance

Local Chromium engineering PASS does not establish physical phone feel, touch
reliability under Android scheduling, speaker mix, or player enjoyment. The next
acceptance action is a physical Android Chrome playtest of the deployed artifact.
Small phones can scroll the start panel; native touch scrolling was verified.
Browser-local times are personal records, not a tamper-resistant leaderboard.
