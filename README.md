# Karambe Village Water Run

**[Play on Android Chrome](https://falloutmule.github.io/karambe-village-water-run/)**

Level 1, 2 and 3 are available immediately from the opening screen. **Start Full
Run** remains the main speedrun route.

A portrait arcade speedrun: carry an empty jerry can down the mountain, fill it,
then bring the heavy can home by the long route. Deliver three cans per level.
Rocks join in Level 2; snakes join in Level 3. Hits cost the current attempt and
time, never banked deliveries.

Use **Download Offline Game** on the opening screen, then open
`Karambe-Village-Water-Run.html` with Chrome. The complete game, SFHS touch
runtime, artwork, effects and original West African pop chiptune-inspired score
are contained in that one file. Android Chrome is the primary acceptance device;
automated Chromium results are engineering evidence only.

Hold LEFT/RIGHT to move into ladders. Tap CAN to place or retrieve it; hold CAN
at water to fill, at home to pour, or facing a rock to block. A full can cannot
jump: place it ahead, jump, and retrieve it. Place a full can onto a snake to
crush it. Keyboard: arrows or A/D to move, Up/W to jump, C/Space for CAN, Esc menu.

Sound preference and best times persist when browser storage is available.
Private browsing or file-origin storage policies may limit persistence;
downloaded gameplay itself has no network dependency.

## Development

Node 22+; `npm ci`, `npm run build`, `npm run build:check`, then `npm run test:all`.
Tests use installed Chrome via Playwright's `chrome` channel. Edit `src/` and its
build manifest; root `index.html` is generated. There is no server or CDN at runtime.
The small esbuild packer embeds the actual pinned SFHS runtime and preserved
license; it does not claim SFHS packer certification.

On localhost or a downloaded file, append `?dev=1` for the `CR.game` and
`CR.controls` test hooks. Development sessions do not write progression or best
times. That flag has no effect on public GitHub Pages. Normal builds
expose only build metadata and a read-only `CR.runFullSelfCheck()`.

See [verification](docs/verification.md), [SFHS provenance](docs/sfhs.md),
[audio](docs/audio.md), and the interactive [gameplay](docs/atlas/gameplay.html)
and [runtime](docs/atlas/runtime.html) diagrams. V0.9 development history and
private phone screenshots are preserved outside this public repository.
