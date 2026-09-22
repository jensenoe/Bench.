# Handoff to Claude Code

Written by the Cowork session that built Bench. up to 0.9.0-beta.1 (22 Sep 2026). You are on Noël's
Windows machine with the real toolchain, the real Microsoft tenant and GitHub. That is exactly what the
previous session did not have, so the list below is ordered by what only you can do first.

## Status after the first Claude Code session (22 Sep 2026, afternoon)

Done, on `main` in small commits:

- Section 0: `git init`, `.gitignore` verified (no photos, data, backups or token cache staged), history
  pushed to https://github.com/jensenoe/Bench. (the name really ends in a period; the git URL is
  `https://github.com/jensenoe/Bench..git`) on top of the GitHub initial commit. `gh` is not installed;
  Git Credential Manager holds the browser sign-in. A `.gitattributes` pins LF (CRLF for `.bat`).
- Section 1: `npx electron-builder --win nsis portable` completes with the guarded `installer.nsh`.
  `release\Bench-Setup-0.9.0-beta.1.exe` and `Bench-portable-0.9.0-beta.1.exe`, 290 MB each, well under
  the 450 MB ceiling. Not yet done: installing it and looking at the installer pages (needs a human).
- Section 2: no `bench.log` exists yet, so the noon crash has not been captured. Added `child-process-gone`
  logging (GPU death is not seen by `render-process-gone`) and a `"hardwareAcceleration": false` opt-out in
  `machine.json` / portable `settings.json`. Read the log after the next noon.
- Section 5 (what headless Chromium can show): all seven pages at 900/1280/1440/1920 in both themes.
  No console errors, no horizontal scroll, focus ring visible on every tabbed control, Escape closes Search.
  Fixed: Logbook action checkboxes had no label; motion/react now honours reduced motion (`MotionConfig`).
  Open: the page links are `hidden lg:flex`, so a window between 900 and 1023 px wide has no nav apart from
  the footer and the doors. Decide whether to shrink the nav at that width or raise `minWidth`.
  Found on the way: `Punch.jsx` defined two wrapper components inside render, so every nav button remounted
  every second (the rule from CLAUDE.md, fourth time). Fixed. `Stat.jsx` and `StickyBar.jsx` imported
  `framer-motion`, which is not a declared dependency; now `motion/react`. Unused `Hero.jsx` removed.
- Section 6: `scripts/gen-fetch.mjs` and `npm run photos:bat`. Regenerates the bat byte for byte except
  three photographer names that are now transliterated properly (Cyrillic, ł, ı), and keeps the README
  counts current (the range is 24 to 39, not 40).
- Section 7: Vitest (`npm test`, 35 tests over `store`, `timeclock`, `scenes`) and ESLint 9 with the house
  style (`npm run lint`, zero errors, 11 warnings left on purpose). `roundFor` is exported for the tests.

Still needs Noël present: sections 3 and 4 (Microsoft 365 on the real tenant, QMS and BOM cookie sessions),
the installer walk-through, and the questions in section 8.

Added later the same afternoon, on Noël's request:

- All-in-one install: `install-bench.bat` at the repo root (installs Node LTS via winget if missing, runs
  `build-exe.bat auto`, starts the resulting installer). `build-exe.bat` takes `auto` (no pauses, retries
  without icon stamping when the symlink step fails) next to `plain`. `.github/workflows/release.yml` builds
  both exes on a Windows runner for `v*` tags and attaches them to a GitHub release, so the installer itself
  can be downloaded from GitHub. Actions minutes on a private repo are billed; Windows counts double.
- Background sync every 2 minutes (`SYNC_INTERVAL_MINUTES`, default was 5) and only for connected tools
  (`syncConnected` in `server/sources/index.js`): Graph sources need a signed-in account, cookie sources a
  successful sync since sign-in. Manual Sync on the Tools page still tries everything.
- Repo hygiene check for Noël's concern: git history holds no tokens, MSAL cache, board, time clock or
  settings files. It does hold the public Azure client id and tenant id, the SharePoint site and list ids,
  and his work email as package author. Removed the unused `SyncBar.jsx` and `start-ridgeline.bat`.
- `release\data\` (a portable test run from 13:29) was copied to `backups\portable-data-2026-09-22-1329\`
  before `build-exe.bat` cleared `release\`.

Later still, after Noël's evaluation: `ROADMAP.md` lists 32 items; all but 9 (BOM-fed procurement, needs the
BOM data shape) and 23 (the noon log) landed. What to know when touching them:

- `server/store.js` now enforces the Today cap (`CapError`, 409) for local creates and moves, merges per
  task when another Bench wrote the shared file (`reconcile`, tested in `tests/store-shared.test.js`), and
  owns `checklist`, `repeat`, `supplier`, `poNumber`, `orderedOn`. Completing a repeating task spawns the next.
- `server/timeclock.js`: `plainError`, `probe` (workbook check), `closeUnclosed`, `month`. `server/updates.js`
  asks GitHub for the latest release; private repo, so a token (Settings > About) makes it real.
- The tray (`electron/main.cjs`) only exists when packaged; `npm run desktop` behaves as before. Nobody has
  run the packaged tray yet: check that close hides, the tray menu opens, the notification click shows the
  window, and Quit really quits.
- Photographs are rendered at 2400 px now (`src/library.json`, bat regenerated): 139 MB of pictures instead of 196, installer and portable exe 220 MB instead of 290.
- Headless checks of the new UI live in the session scratchpad only; the CI workflow runs tests, lint and build.

Rules of the road: read `CLAUDE.md`. Be direct with Noël, show reasoning, do not soften. No em dashes in
copy. Headlines end with periods. Ask before anything irreversible on his data folders.

## 0. Push to GitHub (first, so everything after is diffable)

The GitHub repo for this project already exists in Noël's account; ask him for the exact name or find it
with `gh repo list`. Then, from `C:\Users\Noel\PycharmProjects\mountain-dashboard`:

1. `git init` if there is no `.git` (there was none when this was written).
2. Check `.gitignore` (rewritten in this handoff): `node_modules`, `dist`, `release`, `data/`, `backups/`,
   `.env`, `.msal-cache.json`, `*.log`, and every `public/terrain/*.jpg` except `dawn/day/dusk/night/ridge.jpg`.
   Confirm with `git status` that no photo, no data file and no token cache is staged. `backups/portable-data-2026-09-22/`
   contains real synced tickets; it must not be committed.
3. First commit: "Bench. 0.9.0-beta.1: board, procurement, tools, logbook, napkin, time clock, installer".
4. `git remote add origin <repo>`, push `main`. Then work in small commits per task below.

## 1. Build the beta and confirm the installer

`build-exe.bat` had never completed for the beta. The `.7z` was produced and makensis then failed; cause was a
duplicate `!define MUI_HEADERIMAGE_RIGHT` (electron-builder defines it when `installerHeader` is set). All
defines in `build/installer.nsh` are now guarded with `!ifndef`, but this has not been run since.

- Run `build-exe.bat`. Expect `release\Bench-Setup-0.9.0-beta.1.exe` and `release\Bench-portable-0.9.0-beta.1.exe`.
  If makensis still fails, run `npx electron-builder --win nsis` alone for the full log; the usual suspects are
  a define electron-builder also sets, `MUI_FINISHPAGE_RUN_TEXT` (electron-builder sets `MUI_FINISHPAGE_RUN`), or
  the prerelease version string in `VIProductVersion` (electron-builder normally strips it; if not, set
  `buildVersion: "0.9.0"` in `package.json` `build`).
- Install it and check the installer pages actually look dark (MUI_BGCOLOR/TEXTCOLOR) with the sidebar bitmap
  (`build/installerSidebar.bmp`, 164x314) on welcome/finish and the header (`installerHeader.bmp`, 150x57) on
  inner pages. Windows draws buttons and the progress bar itself; that is expected.
- `fetch-photos.bat` now downloads all 302 pictures at 2880x1620 (file names changed to `<lib>-<scene>-<id>.jpg`)
  and deletes the old names at the end. Check the installer size afterwards; if it passes ~450 MB, drop the
  render width back to 2400 in `src/library.json` (regenerate the bat, see section 6).

## 2. The 12:00 black screen

Noël reported the window going black at 12:00 (lunch notification time) on 22 Sep. Not reproduced: the lunch
page renders in every clock state and a faked clock crossing noon in a browser threw nothing. Instrumentation
was added: `%APPDATA%\bench\bench.log`, `render-process-gone` auto-reload, a React error boundary (`src/components/Fault.jsx`),
`try/catch` around Electron notifications.

- Read `bench.log` after the next noon. `[renderer] gone` means a Chromium crash (look at `reason`, `exitCode`);
  `render crash at #/…` means our React code, with a stack.
- Test the actual notification path on Windows, which the previous session could not: the toast at 12:00
  (`server/timeclock.js` `tick`, `electron/main.cjs` `notify`). Click it, and also do not click it. `app.setAppUserModelId('fit.tom.bench')`
  is set; check the toast shows the app name and icon.
- Suspects worth ruling out: GPU process on his machine (try `app.disableHardwareAcceleration()` behind a
  setting if the log says the GPU process died), and memory from 2880px images crossfading every 20 minutes
  (watch the renderer's memory over an hour with Task Manager; `Photo.jsx` keeps the previous image mounted
  during the fade).

## 3. Microsoft 365 on the real tenant

Nothing Graph-related has run against the real account yet. Sign-in itself now works because it asks only
for CORE scopes; `Sites.Read.All` and `Calendars.Read` need a tenant admin to open the admin-consent link
shown in Settings once.

Verify, in this order, with Noël present:

1. Connect in Settings (device code, opens browser, copies code, polls until landed). Confirm `auth.signedIn`
   and that a restart keeps the session (MSAL cache in `BENCH_SECRETS_DIR`).
2. Planner sync: `POST /api/sync/planner`. Tasks land with `source: 'planner'`, completing one here completes
   it in Planner (`server/planner.js completeInPlanner`).
3. Time clock write: clock in, check `Documents/TomFit_Zeiterfassung_2026_Noel Jensen.xlsx`, sheet `Monat`,
   the row for today (found by date serial in column A; fallback row 8+day or 6+day), column C gets the
   in-time as a day fraction with `h:mm` format. Then lunch out (D), lunch in (E), out (F), pause G set to 0
   when D/E are used. Rounding: in rounds down to 5 min, out rounds up, lunch exact. Confirm which of the two
   workbook copies in his OneDrive is the canonical one; Settings has a path template and a sharing-link override.
4. After admin consent: `POST /api/sync/issues` (SharePoint list on `netorgft10707311.sharepoint.com`, list
   `635ea462-…`, 386 tickets, filter by `incharge`/author matching his name via `isMe`) and `GET /api/calendar/today`.
   Until then, Tools shows "Needs admin approval" for Issues and Logbook says the calendar needs approval.
5. Token expiry: sign in, wait a day, sync. If Graph returns 401 the UI must show "Reconnect Microsoft 365"
   (Tools.jsx `expired`), not silently fail.

## 4. QMS and BOM (cookie sessions)

`server/sources/qms.js` and `bom.js` read the tools through a persistent Electron session (`persist:tomfit`)
after the user signs in once in a Bench-owned window (`openSignIn` with per-tool probes). Never verified end to
end on his machine: sign in via Tools > Sign in, then Sync, and check the items assigned to him arrive with
titles and URLs. If the probe never turns true, log what `runInSite` returns for the probe JS.

Procurement is currently fed by tasks with `orderBy`/`leadTimeDays`, entered by hand. The intended next step
is a BOM-fed procurement view (parts with lead times from the structured BOM). Needs Noël's input on the BOM
tool's data shape; do not guess it.

## 5. Full audit checklist

Go through every page in both themes at 1280, 1440, 1920 and the 900px minimum window width. Screenshots
exist from headless Chromium but nothing was ever looked at in the packaged Electron window on Windows.

- Home: hero greeting variety and time filters (`src/copy.js greeting`), stats count-up, The Week strip
  (`/api/week`), Order dates panel, six doors, footer ghost name alignment at 2xl.
- Board: five lanes, Today cap of 5 (server-side? check `server/store.js` enforces or only the UI), source
  filter chips, hover actions (Today, details, lane select, remove), TaskEditor inline (Enter commits, Escape
  closes), Undo on complete and delete (7 s toast), completed section per lane.
- Procurement, Tools, Logbook (calendar import needs the EXTRA tier), Napkin (drag: free placement with
  `dx/dy`, drop on node re-parents, column drop reorders, Tidy resets; keyboard Tab/Enter/Delete/Space/C),
  Lunch screen, First run (two steps; `setupDone` is only set by the UI now), Settings (every field saves on
  blur; data folder chooser needs a relaunch), Ctrl-K search.
- Keyboard and focus: every button reachable by Tab, visible focus ring in both themes, Escape closes
  Settings/Search/editors. Add `aria-label`s where icons stand alone.
- Reduced motion: `@media (prefers-reduced-motion)` exists in `index.css`; check motion/react animations respect it.
- Light theme: `.on-photo` keeps night tokens over photographs; check every glass block and chip for contrast.
- Nav collision: clocked-in state at 1024 and 1280 (date and "In 09:10" hide below 1400px).
- Startup: "Starts with Windows" toggle uses `setLoginItemSettings` with the portable path when portable.
  Verify the registry entry and that a second launch focuses the running instance (single-instance lock).
- Window bounds memory (`window.json`): off-screen check when a monitor is unplugged.
- Backups: `data/backups/` daily copies, 30 days; check `backupOnce` fires once per day per file.

## 6. Photo library housekeeping

`src/library.json` is the source of truth. `fetch-photos.bat` is generated from it. There is no generator script
in the repo yet; the previous session regenerated it inline. Write `scripts/gen-fetch.mjs` that:

- emits `call :get <file-without-ext> "<url>" "<photographer, ASCII>"` for every entry,
- writes the manifest block and prune loop exactly as the current bat does (CRLF, pure ASCII, `nopause` arg),
- updates the count in the header line and README ("302 photographs").

Then `npm run photos:bat` to run it. Also consider a small `curation/` note per library (which searches, which
filters: Pexels `orientation=landscape&size=large`, verify originals ≥3800px wide).

Known thin spots: Lunch (4 village-at-dusk photos) and Cockpit (5 office photos) could use more; Unsplash URLs
in the older libraries were never re-verified after Unsplash tightened hotlinking.

## 7. Things the previous session wanted but did not get to

- Napkin: export a map as PNG/SVG; convert a node into a board task (like Logbook actions).
- Logbook: recurring meeting templates; attach a file path.
- Board: drag and drop between lanes (currently a select). Keyboard shortcut to add a task (`n`).
- Time clock: monthly summary view from `timeclock.json history`, and a warning when a day is left open
  (`unclosed` exists in state; the UI only shows a dot).
- Settings: export/import of settings; a "Reset introductions" already exists.
- Tests: none. A minimal Vitest suite for `server/store.js` (OWN_FIELDS merge), `server/timeclock.js`
  (`roundFor`, `summarize`, rollover), `src/scenes.js` (`sunTimes`, `keyFor`, slot math) would pay for itself.
- Lint: no ESLint config committed. Add one matching the existing style (no semicolons, single quotes, 2 spaces).

## 8. Open questions for Noël

- Which Zeiterfassung workbook is canonical (two copies were seen in OneDrive).
- Who administers the tom.fit tenant for the admin-consent link (likely Tom or IT).
- Whether `backups/portable-data-2026-09-22/` (176 synced tickets from a portable run) is disposable.
- Whether the board should stay per-machine or move to a shared folder now that colleagues may install the beta.
