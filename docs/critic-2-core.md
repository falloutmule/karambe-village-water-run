# Critic pass 2 — integrated core

Independent review of the current generated `index.html` and canonical game, controls and audio source after the SFHS control integration. Chromium ran at 390×844 with touch emulation; the route traversal itself used real keyboard events through the product adapter. Development entry was local `?dev=1`. This review does not substitute for the dedicated pointer/multitouch suite or physical phone testing.

## Observed play

- Completed one natural L1 can without position injection: descend all three short-path connectors, cross the unstable walkway, reach water, hold CAN to fill, follow the complete lower/upper bypass, take the final climb, return to the village and hold CAN to deliver. Result: one banked can, one 26.70-second split, zero retries. This is an engineering traversal time, not a leaderboard benchmark.
- The full-can message at water explicitly points left, and the nearby yellow route sign reinforces it. Keeping movement held into ladder entrances makes the outbound and longer inbound paths immediately usable. The .78-second walkway warning permits a continuous empty-can crossing; no unexpected wait or control reversal was needed.
- L3 opening traversal reached the right-side landing pocket with no defensive action and no hit. The rock chute is visibly separate from the final player ladder; the screenshot shows one rock on each of the two upper paths. Source collision checks distinguish those platform and connector identities.
- At 390×844 the complete mountain, both route signs, four large controls and footer fit. Rocks and snakes read distinctly against the path. The menu explains ladder entry, tap versus hold CAN, full-can return, defensive CAN and bank-preserving retry before play.
- Music diagnostics advanced at L1 and L3 with bounded active voices. No JavaScript errors occurred. Source provides original synthesized instrumentation, quiet rolling/step effects, distinct success/failure cues and persistent mute. This review checked scheduling and source; it did not judge the audible mix by listening.

## One finite correction

**P3 — the gameplay Menu cue cancels itself.** The `menuBtn` handler calls `sound.menu()` and then `pause()`. Pause calls `sound.tick(...playing:false)`, which stops all voices. A direct Chromium reproduction showed `scheduled` increase from 4 to 5 while `activeVoices` immediately became 0 within the same click handler. Schedule the navigation cue after the pause/stop boundary, as the level-clear flow already does. This is a small sound-feedback defect, not a gameplay blocker.

## Decision

No further mechanic tuning is justified by this pass. Preserve current movement speed, full-can long route, separate chute, and immediate retry structure. The L1 traversal teaches the route and carrying interaction effectively; L2/L3 then add the menu-explained defenses. Do not add tutorials, rewards or timing changes solely on this critic's authority.

Remaining coverage limits: no full three-level natural run; no physical Android feel verdict; no subjective music-mix approval. Main verification and the final independent critic should cover release integrity and remaining hazard interactions. Ignored evidence: `test-results/critic2-observations.json`, `critic2-menu.png`, `critic2-water.png`, `critic2-l3.png`, and the two critic scripts.

Main-thread disposition: corrected before publication; the navigation cue now follows the pause/stop boundary.
