# The Faded Isle

A quiet ink-wash exploration game about the six pillars of Acceptance & Commitment
Therapy. You walk a grey island, and colour returns wherever you step. Six guardian
spirits each teach one pillar through a small exercise, and wild spirits (worries,
doubts, sorrows) in the tall grass are met with ACT skills instead of fought.

**Play:** https://julleqq.github.io/faded-isle/

Plain HTML + JavaScript: no libraries, no image files except the icon, no build step
needed to play.

## Install it on your phone (PWA)

**iPhone:** open the link above in **Safari**, not in another app's browser. Tap
**Share** (the square with an arrow), then **Add to Home Screen** → **Add**.
**Android:** open it in Chrome and tap **Install app** (or ⋮ → *Add to Home screen*).

You get its own icon, fullscreen without browser bars, and offline play after the
first visit. Progress is saved on the device. When the game is updated, the new
version loads the next time you open it with internet.

## Controls

Drag anywhere to walk (a floating joystick). Tap the round button to meet, read or touch.
On a computer: arrow keys / WASD and Space.

## Feedback

Players tap **Leave feedback** (Journal → You, and at the end of the game), type a
message and tap Send. No account needed. It arrives anonymously in a Google Form owned
by the maker, together with progress counts and device type (never anything else
written in the game). Connect the form in `content.js` → `FEEDBACK`; while it is
empty, the button stays hidden.

## Develop

```sh
npx http-server .          # any static server works; ES modules need http://, not file://
node build.mjs             # rebuilds faded-isle.html, the whole game in one file
```

Add `#debug` to the URL to expose `window.GAME` in the console (e.g. `GAME.meetGuardian('values')`).

| File | What lives there |
|---|---|
| `content.js` | **All the words**: pillar teaching, guardian lines, Rumi verses, creatures, moves, values. |
| `world.js` | Island layout (shrine positions, lake, river, forest) and the ink/colour painting. |
| `exercises.js` | The six guardian mini-exercises. |
| `art.js` | Characters, guardians and spirits, drawn in code. |
| `game.js` | Movement, colour reveal, encounters, journal, saving. |
| `audio.js` | Generated music, wind, sea and bells. |
| `sw.js` | Offline support. If you add a new file, list it in `FILES`. |

The verses are loose renderings after Rumi's *Masnavi*, not direct translations,
because many popular "Rumi quotes" are misattributed or copyrighted. Replace them
in `content.js` with a translation you love.

*A reflective game, not a substitute for therapy.*
