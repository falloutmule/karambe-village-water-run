# Critic pass 3 — near-final independent review

Reviewed current root `index.html`, canonical gameplay/control/template/audio source, and ran installed Chrome through Playwright. Inspected 320×568 start/play screenshots and dispatched native CDP touch scrolling. This review preceded publication; it is engineering evidence, not physical Android acceptance.

## Meaningful findings

- **P2 — One collision can count two retries.** `updateRocks` retains the previous player and array after `failCurrentCan` replaces both. Two colliding rocks in one update produce two retries. Reproduced on the built artifact with two rolling platform-0 rocks and one simulation tick: retries became 2. Real scheduled Level 2 hazards naturally overlap too: at 5.883333 seconds, rolling rocks occupy x293.733 and x305 on platform 0. Capture the attempt version and return immediately when collision resets it; add a regression proving one failure, one retry.
- **P2 — Stopwatch is too small on narrow phones.** The 320×568 gameplay screenshot makes the canvas stopwatch/current-level lettering approximately 6–7 CSS pixels. This undermines the primary speedrun information even though movement/CAN/JUMP buttons remain readable. Increase HUD lettering to maintain approximately 10 CSS pixels minimum at 320px width.
- **P3 — Start requires scrolling on short phones.** On the 320×568 developer menu, the panel is 509px tall with 809px content; START is below the initial fold. Native touch swipe successfully moved scrollTop from 0 to 289, so this is discoverability polish rather than a blocked flow. A brief scroll cue or more compact first screen could help, but is not required to expand this task.

## Positive evidence and limits

- Portrait play fills width; four large controls and footer stay visible. Route labels identify the full-can route and empty-only walkway. The final ladder and rock chute are visually distinct.
- Native touch scrolling works in the rules panel; keyboard movement in the built artifact moved x62 to x186.69 without an error.
- Source uses authoritative SFHS contact ownership with explicit canceled CAN transactions and immediate reset cleanup; debug access requires a local/file origin plus dev=1 and suppresses record/unlock writes.
- Pauses explicitly state that the stopwatch is paused; capped simulation frames retain excess wall time. Timing is suitable for local in-game comparisons, not a server-validated competitive leaderboard.
- Existing full-route and control suites were inspected as context, not misrepresented as this critic's independent phone playthrough. Hearing soundtrack balance on phone speakers and judging actual thumb feel remain physical-device acceptance tasks.

## Repair verification

The rebuilt artifact was independently rechecked in Chrome: the identical overlapping-rock fixture now produces exactly one retry, returns the player to x62, and clears the rocks. The retry issue is resolved. The final HUD revision sets both label and stopwatch to 20 world pixels. Independently inspected 320×568 L1 and L3 screenshots with a nonzero 02:03.45 stopwatch: both are readable and do not overlap. Measured horizontal gaps between the label and stopwatch panels are 120.10 world pixels in L1 and 70.36 in L3. The stopwatch finding is resolved. Final screenshots: `test-results/critic3-final-l1.png` and `test-results/critic3-final-l3.png`.

**Disposition:** Both P2 findings are resolved and independently verified on the rebuilt artifact. No remaining publication blocker was found in this critic pass. No additional architectural work or feature expansion recommended. Physical Android Chrome PASS remains unclaimed.


