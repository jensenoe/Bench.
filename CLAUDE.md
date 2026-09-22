# Bench. (repo: mountain-dashboard)

Personal project board for Noël Jensen, Mechatronics Project Specialist at TomFit Health Training AG.
Electron desktop app, Windows first. Everything in this repo is in scope of his TomFit role.
Read `HANDOFF.md` before changing anything; it lists what is verified, what is not, and what to audit.

## Stack

- Vite 6, React 18, Tailwind v4 (`@theme` in `src/index.css`; base resets must sit in `@layer base` or they beat utilities), `motion/react`, `@phosphor-icons/react`, Outfit + Work Sans via fontsource variable fonts.
- Express server in `server/` (ESM), embedded in Electron (`electron/main.cjs`, CommonJS, imports the server through `pathToFileURL`). `npm run dev` runs server + Vite; `npm start` server only; `npm run desktop` builds and opens Electron.
- Electron 33, electron-builder 25: NSIS installer (`build/installer.nsh`, sidebar/header BMPs in `build/`) and a portable exe. `build-exe.bat` does everything on Windows; `build-exe.bat plain` skips exe stamping when winCodeSign's 7z symlink step fails (needs Developer Mode or admin).
- Microsoft Graph via MSAL device-code flow (`server/auth.js`). Public client, id baked in. Two scope tiers: CORE (`Tasks.ReadWrite`, `Files.ReadWrite`) which users can consent to; EXTRA (`Sites.Read.All`, `Calendars.Read`) which needs tenant-admin consent (`auth.adminConsentUrl()`).

## Where data lives

- Shared board (`tasks.json`, `logbook.json`, `napkin.json`, `backups/`): `BENCH_DATA_DIR`. Installed: `%APPDATA%/bench/data` unless Settings picked a shared folder (`machine.json` / `settings.json dataDir`). Portable: `data/` beside the exe. Dev: `./data`.
- Per-user (`BENCH_USER_DIR`): `settings.json`, `timeclock.json` (90-day history), `window.json`, MSAL token cache (`BENCH_SECRETS_DIR`). Installed: `%APPDATA%/bench/user`. Never put these in the shared folder.
- `bench.log` in `%APPDATA%/bench/`: main-process errors, renderer crashes, page errors (via `window.bench.log`). Settings > About opens it.

## Conventions that matter

- Copy: no em dashes anywhere in UI text, docs or comments. Headlines end with a period ("Board.", "Something broke."). Voice is plain, first person where the author speaks (About, footer). Photos are credited by name in Settings > About.
- Dates: `shortDate`/`fmtDate` in `src/lanes.js` ("Tue 22 Sep"), never `toLocaleDateString` with `month: 'short'` (en-GB gives "Sept"). Times: `de-CH` 24h.
- One reading column: the `.col` class (`--col`, 1120px, 1320px at 2xl). The nav is full width on purpose.
- Components must be defined at module scope, never inside a render (it remounts children and replays animations; this bit us three times).
- Scenes follow real sunrise/sunset for Oetwil am See (`sunTimes`, `keyFor` in `src/scenes.js`). Pictures change every `pictureMinutes` (Settings; default 20). `libraryFor`/`imageFor` take a Date and an optional slot shift; headers use different shifts so no two share a picture.
- Photo files are named `<library>-<scene>-<pexelsId>.jpg`; `fetch-photos.bat` is generated from `src/library.json` and prunes files that left the library. Never hand-edit the bat; regenerate it (see HANDOFF.md).
- Server settings whitelist lives in `server/settings.js` (`DEFAULTS` keys). Adding a setting means adding it there and in the Settings panel.
- Task fields the board owns vs. the source tool owns: `OWN_FIELDS` in `server/store.js`. A sync never overwrites lane, notes, order-by, waiting-on, priority, tags.

## Working here

- `ROADMAP.md` is the task list; refer to items by number in commits and tick them there when they land.
- Dates in the UI go through `src/components/DateField.jsx`, never a bare `<input type="date">`.
- Task writes can be refused: `CapError` (409) from `server/store.js` when Today is full. The UI turns that
  message into a toast, not the red error pill.
- The tray and close-to-hide only exist when `app.isPackaged`; dev runs quit on close as before.

## Testing here

- `npx vite build` must pass. Playwright + Chromium are available for screenshots: start `BENCH_DATA_DIR=<tmp> PORT=5199 node server/index.js`, drive `http://127.0.0.1:5199/#/<route>`. Seed data shape: see `server/store.js` `createTask` and `server/notes.js`.
- Graph paths (Planner, Excel write, SharePoint issue list, calendar) cannot be exercised without Noël's account. Mocks were used; see HANDOFF.md for what is still unverified on the real tenant.
- Windows-only steps (NSIS, portable exe, startup registration, toast notifications) need a Windows machine.
