# Bench. design.

The one page that says how Bench. looks and why. Read it before touching a component; change it when
the product changes, in the same commit. Values here are the values in `src/index.css` and
`src/scenes.js`; if the two disagree, the code is wrong.

## 1. Atmosphere

A workbench at night with a window onto the mountains. The photograph is the room's light; the
panels are furniture standing in it. Calm, dense enough for a working day, never decorative. The
sky sets the mood four times a day (dawn, day, dusk, night, by the real sun over Oetwil am See) and
the interface follows: one accent colour, one glow at the top of the page, one colour grade over the
pictures. Nothing else changes with the scene.

Density: a board that holds a day's work at 1024 px and three lanes at 2560 px without growing
margins. Variance: low. The same panel, row and pill everywhere; the pictures bring the variety.
Motion: slow and ambient (pictures drift over minutes), quick and quiet on interaction.

## 2. Colour

Everything is a token. Components never carry a hex value; `npm run lint` fails if one does.

### Surfaces and ink

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#15161C` | `#F3F1EC` | page. A deep warm grey, not black; warm paper, not white |
| `--bg-2` | `#1A1B22` | `#EAE8E2` | fields, wells |
| `--panel` | `#1E1F27` | `#FFFFFF` | section panels |
| `--row` | `#25262F` | `#F7F6F2` | rows and cards inside a panel |
| `--ink` | `#F3F3F1` | `#16161A` | type |
| `--ink-2` | ink at .72 | ink at .76 | secondary type, lines under a title |
| `--ink-3` | ink at .62 | ink at .62 | labels, meta, placeholders. Never lighter: .62 is what keeps 4.5:1 on a row |
| `--line`, `--line-2` | ink at .08 / .14 | ink at .10 / .18 | hairlines. No solid grey borders |
| `--veil` | `21,22,28` | `243,241,236` | rgb of the page for scrims over photographs |

`.on-photo` forces the dark set on anything laid over a picture (nav, header glass, doors), in both
themes, so pictures stay pictures and paper is for the panels. `.off-photo` does the reverse for a
panel that stands in a photo area but belongs to the page.

### Functional colours

Four meanings, the same everywhere. Text on paper uses the darker light-theme set.

| Token | Dark | Light | Means |
|---|---|---|---|
| `--late` | `#F0776B` | `#B9432F` | a date is past, something failed, Today is over its cap |
| `--caution` | `#E8B85A` | `#946212` | waiting, not written to the sheet yet, needs a look |
| `--ok` | `#8CD3A2` | `#2E7D4F` | written, delivered, done |
| `--held` | `#7CC8DA` | `#1F6F86` | ordered, on its way, parked |
| `--late-ink` | `#2A0A08` | `#FFF6F4` | type on a late-coloured surface (the error pill) |

In JavaScript they are `STATUS.overdue`, `.caution`, `.done`, `.held` from `src/scenes.js`, which
resolve to the tokens. Tints are made with `color-mix(in srgb, <token> 14%, transparent)`, never a
second hex.

### The scene

| Scene | Glow | Accent (dark) | Accent (light) | Grade | Filter |
|---|---|---|---|---|---|
| Dawn | `#3A2C4A` | `#F0A483` | `#B85A34` | `240,164,131` warm | saturate .9, contrast 1.04, sepia .1 |
| Day | `#1B2A3C` | `#8CC4F5` | `#2E6CA8` | `140,180,230` cool | saturate .86, contrast 1.05 |
| Dusk | `#3A2038` | `#F09468` | `#B9501F` | `236,140,104` warm | saturate .92, contrast 1.05, sepia .12 |
| Night | `#0E1526` | `#9DB9E6` | `#3A5B96` | `96,116,168` cool | saturate .8, contrast 1.06, brightness .94 |
| Lunch | `#2E1E33` | `#F5B26B` | `#B0662A` | `245,178,107` warm | saturate .92, contrast 1.04, sepia .1 |

The accent is for the primary action, active nav item, focus ring, the period after "Bench" and
the figure in a header aside. It never carries a status. `--accent-ink` is the type on an accent
surface. The glow is a radial at the top of work pages and at the footer seam, at most .6 opacity.

## 3. Photographs

302 pictures from eleven libraries and dozens of photographers must read as one product. Three
layers do that, on every picture, in this order:

1. `.photo` on the image: the scene's filter (table above).
2. `.grade`: the scene's colour at `--grade-a` (.35) in `soft-light` blend. Warm scenes lean warm,
   cool scenes lean cool. Change the strength in one place, `--grade-a`.
3. `.grain`: a still fractal-noise tile (160 px) at .07 in `overlay` blend. Hides banding in the
   fades and evens out compression. It never moves.

Then the veil. Work-page headers are `58vh` (460 to 760 px) and the first panel sits 120 px into
the picture (`OVERLAP`), so the photograph is covered by content, not cut off by a fade. The fade
uses the night veil at the top (the nav reads on it) and the page's own colour at the bottom. Type
on a photograph sits in `.glass` (veil at .42, blur 22 px, 20 px radius) with `--shadow-text`.

New libraries: 3200 by 1800 px, landscape, no people in the foreground, no text. Credit by name.
Never lower the resolution; the reference monitor is wide.

Which picture where: every picture on screen follows one time of day (the Time of day setting, or
the real sky) and one library (one library a day with several on, or Random). Pages differ by slot,
not by scene: the hero is slot 0, the five Home doors are slots 5, 2, 3, 4 and 1, so with six
pictures per scene all six differ; page headers reuse slots freely, since one page shows at a time.
A slot above 5 wraps back onto slot 0 in a six-picture library, so Home never uses one. Each
library needs at least six pictures per scene.

## 4. Type

- Display: Outfit, weight 600, letter-spacing -0.025em, `leading-none`. Every headline ends with a
  period: "Board.", "Ready.", "Something broke."
- Body: Work Sans 400 and 500. Numbers are `tabular-nums` (`.tnum`) wherever they line up.
- Scale (px): hero 56, page header 46 (36 below sm), door 40 and 28, section title 20 to 24,
  body 14 to 14.5, meta and chips 13, the floor is 12. Noël likes the bigger text; when in doubt go
  up, never below 12.
- Line length: prose at most 48ch under a headline, 65ch in panels.
- Mono: JetBrains Mono, on the Hours page only (`.mono`, `.ledger`). A time sheet is a table first,
  so it is set as telemetry: monospace figures, a one-pixel grid, no card. No other page borrows it.
- No serif, no monospace elsewhere, no Inter, no all-caps eyebrows.

## 5. Shape

Panels 20 px, rows and cards 12 px, fields 10 px, buttons and nav items full pill, checkboxes and keycaps 4 px.
Nothing else. Borders are hairlines from `--line`; a panel never has both a border and a shadow
in the dark theme. Shadows: `--shadow-panel` for floating panels (search, time clock, toasts),
nothing on resting panels. Shadows are never black: they are the scene's night glow (`--glow-dark`)
at 72 percent in the dark theme, 24 percent on paper, so a dusk panel throws a plum shadow and a
day panel a blue one.

## 6. Components

- Button: pill, accent fill with `--accent-ink` for the one primary action on a screen, otherwise
  `--row` fill or ghost. `translateY(1px)` on press. Never a glow.
- Field: `.field`, label above, help or error below in `--caution` or `--late`. Dates only through
  `DateField`. Focus is the 2 px accent outline, 2 px offset, everywhere.
- Chip and tag: 12 to 13 px, one line, tinted with `color-mix`; the full text on hover and focus. Grey
  chips use `STATUS.muted` (ink at .7), one grey, not three.
- Checkbox: the drawn circle or square is 13 to 18 px; the button around it is 24 px, always.
- Dimming: never by opacity on text. Use `--ink-3`, so it still passes contrast.
- Toast: bottom right, one line of plain words, at most one link, read by the live region. A
  refused write (Today is full) is a toast. A fault is the error toast: bottom centre, "Something
  broke." with the message, Retry and Dismiss, role alert, stays until dealt with. Never a bare pill.
- Key sheet: `?` lists every shortcut; Escape closes it and gives focus back.
- Day dialogs: the morning brief and the evening close are overlays in the key sheet's pattern, one
  headline with a period, sections with counts in their titles, one primary pill, a quiet "Later" or
  "Not now" link with a 24 px hit area. Choices are radio pills at 24 px.
- Ledgers and feeds: Recent changes, Backups, the Machines detail and the Review page are panels of
  rows, 13 to 13.5 px, a headline with a period, empty sections left out or one sentence.
- Wall mode is the one page allowed larger type: nothing under 16 px, no controls, Escape leaves.
- Photographs from the phone: thumbnails at 12 px radius, a task picker, Attach and Dismiss.
- Empty state: one sentence that says what to do next, in `--ink-3`, never "No data".
- Loading: a skeleton in the shape of what is coming (`Skeleton.jsx`: page, panel, ledger). Never
  the word "Loading", never a spinner.
- Icons: Phosphor. `bold` up to 15 px, `regular` from 16 px, so a row never mixes weights.

## 7. Layout

One reading column, `.col`: 1120 px, 1320 from 1536, 1560 from 2200, 1760 from 3000. The nav is
full width on purpose. Lanes: one to three columns by width, never a fourth. Minimum window 1024 px.
No horizontal scroll at any width; no element that only exists on hover takes layout space.

## 8. Motion

- Ambient: pictures drift 3 percent over 90 and 120 s, stars twinkle over 6 s. The hero parallaxes
  on scroll. That is all the ambient motion there is.
- Interaction: `motion/react` with ease `[0.16, 1, 0.3, 1]`, 0.4 to 0.7 s for panels arriving,
  0.2 s for hovers. Transforms and opacity only; never animate width, height or position.
- `MotionConfig reducedMotion="user"` and the `prefers-reduced-motion` block switch everything off.
  The picture still changes; it just does not move.

## 9. Words

Plain, first person where the author speaks (About, footer, coach). No em dashes anywhere, not in
copy, docs or comments. Dates through `shortDate` and `fmtDate` ("Tue 22 Sep"), times `de-CH` 24 h.
Errors say what happened and what to do, in one sentence each. No exclamation marks, no "Oops".
The middle dot joins at most two things on a line. Three or more become separate spans with a gap,
or a comma list.

## 10. Never

- Raw hex or rgb in a component. Pure black or pure white as a surface.
- A second accent, or the accent used to mean a status.
- Cards with a border and a drop shadow; nested cards; a fourth radius.
- Circular spinners; "Loading" as the only content; "No data"; black shadows; three items on one dot.
- Eyebrow labels, gradient text, glows, bento grids, marketing heroes. The hero is the sky.
- Font size under 12 px. Contrast under 4.5:1 for text, 3:1 for icons and hairlines that matter.
- Controls that only exist on hover with no keyboard route. Anything without a visible focus ring.
- A page change that leaves focus in the nav; a focused control hidden under the nav.
- Em dashes. Headlines without a period. Titles wrapped one word per line.

## 11. Checks

`npm run lint` runs ESLint and the token check (`scripts/check-tokens.mjs`). `npm run test:ui`
walks every page in Chromium: axe-core with the WCAG 2.0 to 2.2 AA rules on every page, buttons and
links at least 24 px, no console errors, no horizontal scroll, the time clock panel is hittable, the
key sheet opens, focus follows the route, chips stay on one line. Before a release, look at Board, Home and Hours at 1280 and 2560 in both themes.
