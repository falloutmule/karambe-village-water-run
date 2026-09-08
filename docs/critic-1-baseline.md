# Critic pass 1 — V0.9 baseline

Reviewed the original `src/game.html`, then used the preserved `test-results/baseline/index.before-completion.html` for an independent Chrome check while implementation proceeded. Visual evidence: `test-results/baseline/menu.png` and `game.png`, captured at 390×844. This is a desktop browser emulation review, not a physical phone feel verdict.

## What already works

- The complete board, water source, village, descending sun, and four large controls fit in the portrait gameplay view. The six-path silhouette reads immediately as the game's identity.
- The basic trip is viable. In Chrome, advancing the original simulation at its native 1/120 step with left/right input, CAN hold, and the intended connector sequence completed one L1 delivery in 26.84 simulated seconds with zero retries. Water was reached at 9.94 s; the filled return reached home at 25.59 s. This check used game input/state instrumentation, not a human speedrun.
- The empty shortcut and full-can return produce an understandable strategic distinction once learned. Full-can bridge entry and the wrong bottom connector give explicit warnings instead of silently permitting an impossible crossing.
- Banked deliveries survive a hit, respawn takes 0.30 s, and the stopwatch continues. These are strong foundations for replay without punitive loss of an entire level.
- Rock collisions are restricted to the matching path/connector; snake respawn avoids the nearby player and loose can. Preserve these fairness safeguards.

## Priority fixes

1. **Teach the actual CAN interaction before hazards demand it.** The start rules say to hold CAN to block and crush snakes with a full can, but omit tap to drop/pick up, hold to fill/pour, and the inability to jump with a full can. In code, a tap under 0.2 s drops the can, while block takes over 0.16 s. New players can therefore drop their protection while trying to learn the button. Add compact, explicit instructions and contextual action wording; avoid adding another control.
2. **Explain directional blocking.** `checkRockCollision` requires the player to face the approaching rock, while the baseline instructions only say “Hold CAN to block.” A player obeying that instruction can still lose the trip. State “face the rock + hold CAN” and give a clear defensive pose/impact cue. Preserve the collision rule unless the completion scope explicitly changes it.
3. **Explain full-can snake handling concretely.** `forceDropCan` places the can 25 world units ahead; full-can crushing works against a snake within 27 units of the dropped can. The useful action is “face the snake and tap CAN to set it down on the snake,” not merely carrying a full can into it. Keep this discovery from costing a nearly finished trip by adding a short L3/contextual hint.
4. **Improve route guidance without changing the board.** The starting view labels WATER and EMPTY CAN ONLY, but the lower FULL CAN PATH sign is spatially distant from the water interaction. The fill message already says to take the long path left; retain it and reinforce the first return turn at the water/left ladder. Do not redesign connector topology or add route-finding systems.
5. **Preserve the reason for failure long enough to read.** The hit message is assigned 0.9 s but the 0.30 s respawn replaces it with “TRY AGAIN — CAN …”. At phone scale this is a very short explanation for losing a 20-second trip. Carry the specific cause into the retry banner or otherwise retain it briefly after respawn.

## Presentation and pacing

- At 390×844, the start card nearly fills the screen: six rule blocks and build-level selection push START FULL RUN to the bottom and sound below the initial visible area. Keep the primary action readily discoverable; avoid expanding this screen with more equally weighted rule cards. Put controls in compact help and teach each hazard at its level introduction.
- The gameplay timer and level text are small but readable in the supplied image. Prefer slightly stronger hierarchy for the current objective/can state over more HUD statistics. The duplicate can count in the footer is less valuable than knowing whether the next action is fill, return, or pour.
- A clean L1 trip is about 27 simulated seconds in this route probe, so three deliveries represent roughly 80 seconds of the same safe circuit. Preserve the three-can contract; strengthen delivery acknowledgment and split/best feedback instead of extending the route or adding content.

## Scope boundary

Highest value: truthful control teaching, cause-specific retry feedback, clear filled-return direction, concise mobile menu, and visually distinct can/hazard feedback. No evidence from this pass supports new levels, extra mechanics, a renderer rewrite, altered resolution, new hazards, or claims of physical mobile smoothness. L2/L3 complete-run fairness and real multitouch still require their dedicated playtest/QA passes.
