# Independent critic pass 1 — deployed baseline

Reviewed state: `c21895183a8e0b2ff80d0cf58af127e8e03393fd` (`karambe-cleanup1`).

This pass independently inspected the canonical source, built artifact, tests,
and clean release sessions at 390×844 and 320×568. It ran the control suite and
deterministic route checks. The result was **FAIL** for release progression.

The release exposed three enabled level buttons on a fresh device. `src/ui.js`
always rendered them, `Game.startLevel()` had no release gate, and
`src/storage.js` deleted `karambe-water-run-full-clear`. The tests and help text
also asserted that incorrect behavior. Existing best-time data could not serve
as an unlock proof because it does not establish a sequential full clear.

The required correction was a persisted `fullRunUnlocked` flag that defaults to
false, is written only after a full L1→L2→L3 completion, gates both UI and the
game API in release, and is bypassed only on trusted local/file `?dev=1` sessions
where persistence remains disabled.

Other inspected systems passed this baseline review: full-run level order,
SFHS contact ownership and 152 control assertions, deterministic L2/L3 routes,
current-can retry preservation, offline packaging, and release debug isolation.
The three older critic documents entered history together and therefore do not
prove three reviews against an evolving state; this is the first fresh pass.
