# Engineering verification

Current candidate: `karambe-haptics1`; phone-test variant:
`karambe-haptics1-test`. Canonical input is `src/` plus its build
manifest; root `index.html` is generated and checked byte-for-byte. This document
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
exactly one retry when several hazards collide; explicit sequential release
unlock; isolated development saves; fixed snake respawn times with safe
grace; original music/SFX and persisted mute; clearer instructions and larger HUD.

## Executed checks

- `npm run build` and `npm run build:check`: build parity and standalone guards.
- `npm test`: 40 gameplay checks, including placement, jump restrictions, fill,
  pouring, checkpoint retry/timer/sun, bridge, snake stomp/crush/respawn, path
  collision identity, rock continuity, overlapping-hit retry, and render purity.
  An authored L1 route delivers all three cans without position teleportation.
- `npm run test:controls`: 111 assertions plus native Chromium CDP multitouch
  and cancellation. Ownership, canceled/outside CAN, no phantom pickup, held
  movement, visual clearing, blur, visibility, viewport and transitions.
- `npm run test:release`: 30 checks. Actual release boot, locked/unlocked menus,
  persisted mute, audio gesture startup, all-level music, portrait control bounds,
  and standalone operation. Progression injection uses a clearly identified
  fixture changing only test-state exposure; normal release is tested separately.
- `npm run test:routes`: L2 and L3 each complete three cans twice, hazards active,
  zero retries, equal repeated elapsed times. Uses simulation inputs/actions;
  no teleports, invulnerability, hazard disabling, or speed changes. L2 blocks
  12 rocks; L3 blocks 18 rocks and squashes 6 snakes. This proves those authored
  routes are feasible, not that a human will achieve the automated times.
- Browser checks report no page errors or unexpected runtime requests.
- Two native Archify diagram exports pass showcase validation and offline checks;
  see `atlas/verification.json`. Three separate staged critic passes are retained
  in `critic-1-baseline.md`, `critic-2-core.md`, and `critic-3-final.md`.

Raw run evidence is ignored under `test-results/`. CI recreates proofs and deploys
only `index.html`. SFHS mobile-control runtime provenance is verified; this product
uses its own small esbuild packer, not an asserted SFHS certification pipeline.

## Published artifact check

On 2026-09-08, the initial verification/deploy workflow for game commit
`06a57bae6f79a8922e160f98ab9c8da27421f494` passed every build/test/deploy step.
The live [Pages game](https://falloutmule.github.io/karambe-village-water-run/)
returned HTTP 200 and exactly matched root `index.html`: 143,460 bytes,
SHA-256 `d691b298e2bfa561bcf8d865c49d13ae87c04d2827f4162929c5262c1599c642`.
`node tools/verify-pages.mjs` reproduced the byte comparison, read-only selfcheck,
fresh-install Level Select lock, public dev-flag rejection, native CDP movement
plus CAN/cancel, and pause UI. No console errors, failed requests, or unexpected
runtime requests were observed for that completion build. Current deployment
commit identity is available in Actions.

## Phone-first testing access

`playtest.html` is generated from the same canonical gameplay with an explicit
phone-test build flag. Its first screen exposes all three level buttons on a
phone; no download, query string, or desktop server is needed. `index.html`
retains sequential first-run progression. Phone tests cannot write normal best
times or unlocks. `tests/phone-access.mjs` checks touch selection and immediate
visibility at 320×568, 390×844 and 412×915, plus storage isolation. Set
`KARAMBE_LIVE=1` to also compare both deployed artifacts byte-for-byte.

## Haptic behavior

The game does not request device vibration. Android hold-callout, selection and
drag defaults are suppressed on every generated gameplay control. The control
suite verifies those event boundaries and stubs `navigator.vibrate` to prove a
gameplay haptic event makes zero calls. Browser automation cannot prove whether a
specific phone's operating system adds hardware feedback outside the web page;
that last distinction requires physical Android Chrome testing.

## Limits and acceptance

Local Chromium engineering PASS does not establish physical phone feel, touch
reliability under Android scheduling, speaker mix, or player enjoyment. The next
acceptance action is a physical Android Chrome playtest of the deployed artifact.
Small phones can scroll the start panel; native touch scrolling was verified.
Browser-local times are personal records, not a tamper-resistant leaderboard.
