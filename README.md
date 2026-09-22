# The Faded Isle

A quiet ink-wash exploration game about the six pillars of Acceptance & Commitment
Therapy. You walk a grey island; colour returns wherever you step. Six guardian
spirits each teach one pillar through a small exercise, and wild spirits (worries,
doubts, sorrows) in the tall grass are met with ACT skills instead of fought.

Plain HTML + JavaScript: no build step, no libraries, no image files except the icon.

## Play

- **Single file:** `faded-isle.html` is the whole game in one file (rebuild with `node act-game/build.mjs` after editing). Open it in any browser, no server needed.
- **Online:** open `act-game/` on GitHub Pages, e.g. `https://<user>.github.io/<repo>/act-game/`.
- **iPhone fullscreen:** in Safari tap Share → *Add to Home Screen*. It opens without browser bars.
- **Controls:** touch and drag anywhere to move (floating joystick); tap the round button to interact.
  On a computer: arrow keys / WASD and Space.
- Progress is saved on the device (localStorage). *Journal → You → Start over* resets it.

## Run locally

```sh
npx http-server act-game   # any static server works; ES modules need http://, not file://
```

Add `#debug` to the URL to expose `window.GAME` in the console (e.g. `GAME.meetGuardian('values')`).

## Where to change things

| File | What lives there |
|---|---|
| `content.js` | **All the words**: pillar teaching, guardian lines, Rumi verses, creatures, moves, values. |
| `world.js` | Island layout (shrine positions, lake, river, forest) and the ink/colour painting. |
| `exercises.js` | The six guardian mini-exercises. |
| `art.js` | Characters, guardians and spirits, drawn in code. |
| `game.js` | Movement, colour reveal, encounters, journal, saving. |
| `audio.js` | Generated wind, sea and bells. |

The verses are loose renderings after Rumi's *Masnavi*, not direct translations,
because many popular "Rumi quotes" are misattributed or copyrighted. Replace them
in `content.js` with a translation you love.

*A reflective game, not a substitute for therapy.*
