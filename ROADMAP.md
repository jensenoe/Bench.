# Roadmap

Assessment of 22 Sep 2026, agreed with Noël. Numbers are stable; refer to them in commits ("roadmap 14").
Effort: S is an hour or two, M a day, L several days. Ticked when it lands on `main`.

## Must-have gaps

- [x] 1 [M] Keep running when the window closes: tray icon, minimise to tray, so the 12:00 toast, the 12:30 auto-end and the digest fire with the window closed.
- [x] 2 [M] Updates: check GitHub releases, say when a newer version exists, link to it.
- [x] 3 [L] Shared board without data loss: per-task merge on write instead of last file write wins.
- [x] 4 [M] Whose Today: person filter on the board (mine, everyone, one person).
- [x] 5 [M] Drag and drop between lanes.
- [x] 6 [S] Open day handling: prompt at next start to close yesterday at a chosen time, written to the sheet.
- [x] 7 [S] Sync feedback: a quiet toast when the background sync adds or closes items.
- [x] 8 [M] Monthly hours view matching the Zeiterfassung layout, pending and failed writes marked.
- [x] 9 [L] Procurement fed by the BOM: supplier, PO number, ordered-on and delivered-on on every task and on the Procurement rows; a From the BOM section from the adapter; learned lead times and the chase reminder (70, 71). The adapter tries the exact German and English field names first and then any key matching the pattern (Lieferant_Name, eta_datum), and reports every key the tool sends with the source status, so the diagnostics show the real shape after the first sync. Machines (79) groups the parts per machine.
- [x] 10 [M] Checklists on a task, ticked from the card.
- [x] 11 [S] Keyboard: `n` new task, `/` search, `1` to `6` pages.
- [x] 12 [M] Napkin: export PNG and SVG; turn a node into a board task.
- [x] 13 [M] Recurring entries: weekly rituals on the board, meeting templates in the Logbook.

## Improvements to what exists

- [x] 14 [S] Nav below 1024 px: raise the window minimum to 1024 (decision: keep the text size).
- [x] 15 [S] Today cap: make it a rule. The server refuses a sixth local task on Today; the UI says so. Syncs may still land due-today items there.
- [x] 16 [S] Tools page: compact status list with the assigned items underneath.
- [x] 17 [S] Card actions visible on focus and behind a visible affordance, not hover only.
- [x] 18 [S] Time clock errors in plain words: not signed in, workbook not found, sheet or row not found.
- [x] 19 [M] Setup verifies the workbook: reads the sheet names and today's row before the first punch.
- [x] 20 [S] Logbook date field in the app's own format with a small picker.
- [x] 21 [M] Installer size: photographs at 2400 px.
- [x] 22 [S] CI on every push: tests, lint, build.
- [x] 23 [-] The noon black screen: bench.log captures renderer and GPU deaths, and the watchdog (75) reloads a window that stays black for two samples, logging the numbers. If it happens again, Copy diagnostics in Settings > This machine has the log tail.

## Design

- [x] 24 Compact headers on work pages (Board, Procurement, Tools, Logbook, Napkin); Home keeps the hero.
- [x] 25 One-line footer on inner pages; Home keeps the full one.
- [x] 26 Coach popovers anchored where they do not cover the content they explain.
- [x] 27 Nav right side: the time clock as one control.
- [x] 28 Board on wide screens: three lane columns at 2xl.
- [x] 29 Procurement: rows with an explicit date and day count instead of thin bars; drop the duplicate "With other people" panel.
- [x] 30 Text floor at 13 px; tertiary ink contrast checked on dark.
- [x] 31 Lunch status line in words ("written to Monat, row 29"), not the workbook path.
- [x] 32 Light theme hero: shorter fade so the photo keeps its bottom.

## Second batch, 22 Sep 2026 evening

- [x] 33 [S] Nav panels invisible: the mask on the nav clipped the time clock panel and the reminder. Backdrop moved to its own layer.
- [x] 34 [M] Procurement from the BOM, first step (part of 9): the BOM adapter reads supplier, lead time, order number, ordered-on, delivery and need-by under their likely German and English field names, and Procurement shows a "From the BOM" section grouped by machine. Field names still to be confirmed against the real tool.
- [x] 35 [S] Settings export and import (a JSON file; the GitHub token stays out).
- [x] 36 [S] Logbook: files and links on an entry (share paths open in Windows, addresses in the browser).
- [x] 37 [M] UI smoke test with Playwright (`npm run test:ui`), run in CI after the build: pages load without console errors, quick add, the Today cap, drag and drop, the time clock panel is actually visible.

## Third batch, 22 Sep 2026 night: the wide-screen audit

Every page at 1024, 1280, 1440, 1920, 2560 and 3440 px in both themes, plus the code behind them.
No horizontal scroll, no unlabelled control, no console error anywhere. What did need work:

- [x] 38 [M] Photographs at 3200 by 1800 for wide monitors (were 2400). 238 MB of pictures, installer and portable exe 320 MB each (were 220).
- [x] 39 [S] Ultrawide column: the reading column is 1560 px from 2200 px and 1760 px from 3000 px, so three lanes get real width instead of 800 px margins.
- [x] 40 [S] Card titles wrapped one word per line in a narrow lane: the hidden hover actions still took their width. They are a small toolbar on the card's top edge now, shown on hover, focus and while editing; the title keeps the whole row.
- [x] 41 [S] Light theme: the nav's fog and text were cream over the photograph. The nav is on-photo now, night fog and light ink in both themes, like the header glass.
- [x] 42 [S] The update toast borrowed the completion toast's "close it in the tool" line. Toasts have a plain link now ("Download the installer").
- [x] 43 [S] Coach copy said 1 to 6 pages; it is 1 to 7 with Hours.
- [x] 44 [M] Bundle split: Logbook, Napkin, Hours, Tools and Lunch load when first opened (about 60 kB off the start).
- [x] 45 [S] The next picture is fetched a minute before the slot changes, so the change does not flash on a slow disk or share.
- [x] 46 [S] Search also matches supplier, PO number, waiting-on and checklist steps.
- [x] 47 [S] Dead files removed (greetings.js, scenes.json); the last lint warnings that were real (refs read during render in the Napkin, a variable used before its declaration) fixed.

Looked at and left alone, on purpose: the Home hero at 3440 (the photograph carries it), the nav at 1024 (date hidden, everything fits), the 12 px chips (raised earlier, readable at 2560), the footer ghost name at ultrawide (aligned to the column). Not testable here: how 3200 px pictures look on the real monitor at its scaling; if it is 4K at 150 percent, 3840 wide is the next step, at roughly 440 MB for the installer.

## Fourth batch, 23 Sep 2026

- [x] 48 [M] The Release workflow failed on GitHub: the repository name ends in a period, Windows folders cannot, so the runner's workspace did not exist and every JavaScript action died before starting. The job now uses only shell steps in its own folder (git clone, npm, electron-builder, gh release), all preinstalled on the runner.
- [x] 49 [S] Installer finish page: "Add a shortcut to the desktop" tick box (on by default) next to "Open the bench now". The automatic desktop shortcut is off, so unticking really means none; uninstall removes it. The welcome, licence and finish texts and the dark colours now actually apply: electron-builder inserts the pages before customHeader, so they moved into customWelcomePage and customFinishPage.

## Fifth batch, 23 Sep 2026: the UI/UX skill pass

Every UI/UX skill pack Noël installed was read end to end (ui-ux-pro-max and its databases, the taste-skill set,
claudekit design, Vercel guidelines); SKILLS.md and the memory say what each is worth here. What transfers to
Bench. is the audit checklist, the WCAG 2.2 rows and the token discipline, not the landing-page rules. The
proposal, in the order it will be built:

- [x] 50 [S] DESIGN.md: one page with atmosphere, every token, the scene table, type scale, shape lock, motion, words and the banned list. CLAUDE.md points at it.
- [x] 51 [S] Functional colours as tokens: --late, --caution, --ok, --held (and --late-ink), darker on paper. Twelve components lost their raw hex; STATUS in scenes.js resolves to the tokens. `npm run lint` now runs scripts/check-tokens.mjs and fails on a raw colour outside index.css, scenes.js and library.json.
- [x] 52 [M] Accessibility rules in the smoke test: axe-core (WCAG 2.0 to 2.2 AA and best practice) on every page, a 24 px target-size sweep, and checks for the key sheet, route focus, the mono ledger and one-line chips. The Vercel Web Interface Guidelines review ran over src/components: transition-all listed out, "Loading…", the rest was already in place or is noted in DESIGN.md. Fixed on the way: tertiary ink to .62 so every label passes 4.5:1, one grey for chips, 24 px hit areas on checkboxes and on nav, footer, lead-time and tool links, labelled nav landmarks, the coach heading level, the napkin title label, dimming by colour instead of opacity.
- [x] 53 [S] Focus follows the route: after a page change, focus moves to the page heading (lazy pages included).
- [x] 54 [S] Focus never hides under the fixed nav: scroll padding on the document and scroll margin on every focusable element, 112 px (128 px at 2xl).
- [x] 55 [S] Key sheet on `?`: a dialog that lists every shortcut (anywhere, quick add, napkin); Escape closes and returns focus. The coach mentions it.
- [x] 56 [S] Errors with a way back: the red pill is an error toast now, "Something broke." with the message, Retry (state and time clock) and Dismiss, role alert; a dismissed message stays away until it changes.
- [x] 57 [S] Chips stay on one line and trim at 220 px; the whole text shows while the card is hovered or holds focus, and as a title.
- [x] 58 [S] One colour grade across the 302 photographs: each scene sets the picture filter (warm for dawn and dusk, cool for day and night) and a soft-light colour layer (.grade, strength in --grade-a). App.jsx writes both with the accent.
- [x] 59 [S] Film grain on every photograph (.grain): a still noise tile at .07 in overlay, hides banding in the fades.
- [x] 60 [S] Shadows tinted to the scene: --glow-dark follows the scene in both themes and --shadow-panel (and the drag shadow) mix it instead of black.
- [x] 61 [S] Skeletons (Skeleton.jsx): a page skeleton for the first load and lazy chunks, a panel skeleton for Logbook and Napkin, ledger rows for Hours. "Loading" is gone.
- [x] 62 [S] `text-wrap: balance` on h1 to h3.
- [x] 63 [S] One icon weight per size: bold up to 15 px, regular from 16 px (17 small icons that were regular are bold now).
- [x] 64 [S] The middle dot joins at most two things: footer, BOM parts and quick add use spaced spans, lists use commas, the napkin hint points at the key sheet.
- [-] 65 [M] Dropped on 23 Sep 2026: the current icon stays. Was: app and tray icon from the design skill's icon generator. Prepared: google-genai is installed for Python 3.12 and the generator reads GEMINI_API_KEY from `%USERPROFILE%\.claude\.env` (one line, outside the repo, never committed). Then, from `C:\Users\Noel\.claude\skills\design`: `python scripts\icon\generate.py --name bench --style glyph --sizes 16,32,48,256 --output-dir <repo>\build\icon-candidates --prompt "app icon for Bench., a personal project board: a bold rounded letter B with a period, on an off-black #15161C rounded square, ink #F3F3F1, the period in sky blue #8CC4F5"`. The SVGs still need rasterising to build/icon.png (256 px) and build/icon.ico; the current icon stays until one is better.
- [x] 66 [M] Hours page as telemetry: JetBrains Mono figures, a one-pixel ledger grid, a strip of cells for month, sheet and figures instead of a card, today marked with the accent. The one deliberate exception, written into DESIGN.md.

Not adopted, on purpose: landing-page heroes, bento grids and scroll effects (the hero is the sky); the
single-accent lock as written (the accent follows the scene by design, and never carries a status); the
generated palettes and font pairings (ours are better matched than what the databases returned).

## Sixth batch, 23 Sep 2026

- [x] 67 [S] Installer licence page: the note was black type on the night box, unreadable. The RichEdit ignores MUI_TEXTCOLOR, so the box is paper (F3F1EC) now, black type on it, the rest of the page stays night.

## Seventh batch, 23 Sep 2026: Bench working while you don't

Background processes:

- [x] 68 [M] Morning brief: the first start of the day opens it when today has not been seen: leftovers from yesterday with Keep or Back to Active, what came in overnight from the tools, due today, order dates, meetings, the sheet. Start the day applies the choices. Off in Settings > You.
- [x] 69 [M] Evening close: a successful clock-out opens it: each Today task rolls to tomorrow or goes back to Active, and a Day note lands in the Logbook (hours, ticked tasks, meetings, what rolls). One note per day, updated on a second close. Off in Settings > You.
- [x] 70 [M] Learned lead times: every ordered-on and delivered-on pair (own fields and BOM meta) becomes a sample per supplier; the editor proposes the order-by date from the median, ten working days when a supplier is new, never on a weekend. Delivered on is a task field now.
- [x] 71 [S] Chase reminder: an ordered part with no delivery whose need-by lies inside the supplier's lead time gets one notification a day with supplier and PO; GET /api/reminders/chase lists them.
- [x] 72 [M] Calendar-aware Today: one line under the Today lane, free hours (workday minus the meetings still ahead minus the clocked hours) against the hours Today holds, with the unsized count. Workday length in Settings > You.
- [x] 73 [S] A meeting ended: within three minutes a notification offers the Logbook entry; #/logbook?new=<subject> starts it with title and attendees. Once per meeting, skipped when the entry exists.
- [x] 74 [S] Sheet drift check: the month sheet is read back and compared with Bench's punches to the minute; differing cells show as Sheet differs on Hours, and Monday morning says how many days disagree.
- [x] 75 [S] Renderer watchdog: every minute while the window shows, a 48 px capture is scanned; two samples in a row over 98 percent near-black log the numbers and reload the renderer, at most once in five minutes. A crashed renderer is logged once.
- [x] 76 [M] Silent updates: the update check keeps the asset; once a day the newer installer downloads to the temp folder (private repo through the API with the token); Bench installs it silently on the next quit, or now from the toast or Settings > About.
- [x] 77 [M] Offline shared folder: a save into an unreachable folder keeps the state in memory, retries every 30 seconds and on the next write, and reconciles when the share is back. Restore refuses while writes are held.
- [x] 78 [S] Health checks in Settings > This machine: board folder, store, Microsoft 365, workbook, sources, backups, mirror, as a row of dots with Check again; Copy diagnostics puts the server's text report and the desktop's versions, paths and log tail on the clipboard.

Features:

- [x] 79 [L] Machines at #/machines (key 9): one page per machine derived from task projects, BOM machines and Logbook projects, with aliases for spellings; a card per machine with counts, and a detail page with open tasks, orders, tool counts, Logbook entries, maps, mentions to assign, rename and merge.
- [x] 80 [S] Global quick add: Ctrl Alt B anywhere in Windows brings Bench forward with the quick add open.
- [x] 81 [S] Tray with a pulse: the menu shows the Today count and the clock state, offers only the punches that are valid now, and refreshes every 30 seconds.
- [x] 82 [M] Focus timer: Focus on a Today card runs 15 to 90 minutes (default in Settings > You) in the nav with pause and stop; the finished minutes land on the task as effort hours, rounded to the quarter.
- [x] 83 [M] Weekly review at #/review (key 8): done, slipped, hours by day and by project, Innovation movement, orders, Logbook entries, as short sentences; Copy as text and Draft a mail (mailto).
- [x] 84 [S] Wall mode at #/wall: the board alone for a workshop screen, the scene photograph behind, a big clock, Today first in large type, the other lanes beside it, refreshed every minute, nothing under 16 px, Escape leaves.
- [x] 85 [M] Photo capture: Settings > Tools takes a folder (OneDrive's camera roll works); pictures from the last 14 days appear on the Board as From the phone with a task picker, Attach adds them to the task's links, Dismiss hides them.
- [x] 86 [S] Command palette: the search box takes actions (type > for actions only): clock in and out, theme, density, data folder, new task, new Logbook entry, brief, close, keys, wall, review, machines, updates.
- [x] 87 [M] Change feed: every create, change, delete and sync lands in history.json with who, when and the fields; Recent changes on the Board lists the last 30 with Undo, which respects the Today cap.
- [x] 88 [S] Keyboard on cards: j and k walk the cards, e or Enter opens the details, x ticks, Alt with arrows moves between lanes, Delete removes. Listed on the key sheet.
- [x] 89 [S] Weather on the Lunch screen from Open-Meteo for Oetwil: temperature, sky, chance of rain in the next hour, sunset. Hidden when offline.

Design and infrastructure:

- [x] 90 [S] Card ageing: the hairline warms toward caution from three to fourteen days untouched and toward late from thirty.
- [x] 91 [S] Compact density in Settings > Look: one-line cards on wide screens, two chips shown until hover, tighter lanes.
- [x] 92 [S] Settings in tabs: You, Look, Hours, Tools, This machine, About; arrow keys move, the last tab is remembered, every field kept.
- [x] 93 [M] Visual regression: npm run test:visual takes 28 shots (seven pages, 1440 and 2560, both themes, photographs masked, clock frozen) and compares them with tests/ui/baseline at 0.6 percent; CI runs it after the smoke test and keeps the diffs as an artifact when it fails.
- [x] 94 [S] Installer smoke test in the Release workflow: silent install into the runner's profile, start, expect the user folder, stop, silent uninstall, expect the folder gone.
- [x] 95 [S] Release notes from the roadmap: the Release workflow lists the items ticked since the previous release, by number, above GitHub's generated notes.
- [x] 96 [S] Backups you can see: Settings > This machine lists tasks, logbook and napkin copies with date and size, Back up now, Restore with a copy of the current file kept, and a daily mirror to OneDrive under Apps/Bench/backups when signed in.
- [x] 97 [S] Visual baselines per platform: CI compares Linux shots with Linux baselines (the Visual baselines workflow records and commits them), the local run compares Windows with Windows; a platform without baselines records them and passes. The first CI run after 93 failed on this.
## Eighth batch, 23 Sep 2026: hardening, improvements, integrations

Hardening (98 and 104 are Noël's: a real-tenant day and the CI and release pages):

- [ ] 98 [M] A real-tenant day with the packaged exe: the brief's meetings, capacity, the meeting-ended toast, the sheet read-back, the OneDrive mirror, the update download, the BOM key discovery, the tray, Ctrl Alt B, the focus timer, wall mode on the real monitor. Then Copy diagnostics.
- [x] 99 [S] Light theme and axe on the new pages: Machines, Review, wall, the brief and every Settings tab are in the axe sweep and the 24 px sweep; the visual test has 44 shots including the two dialogs. Found and fixed on the way: Settings used a dialog role on an aside, seven links under 24 px, a footer line on the wall outside any landmark, a 20 px link on Review.
- [x] 100 [S] End-to-end checks for the day flows in the smoke test: clock out opens the evening close and writes the Day note, a real leftover goes Back to Active from the brief, a change appears in the feed and Undo puts the title back, a backup lists and shows Restore.
- [x] 101 [S] Quiet hours: the desktop drops notifications between Quiet from and Quiet to and at the weekend (Settings > You); the range may cross midnight; force bypasses it.
- [x] 102 [S] Idle cost: the tray reads a light /api/counts (no account call) every 30 seconds while hidden and every two minutes while the window shows; the app poll pauses while the tab is hidden; history.json is capped at 1.5 MB. Measured: the server idles at about 0.1 percent of a core and 64 MB.
- [x] 103 [M] Consolidation: one fetch helper in src/api/http.js, the routes and the palette in src/routes.jsx so App.jsx is state and wiring, dead exports removed, the refresh listener keyed on the function not the object, and the phone folder picker wired for real.
- [ ] 104 [S] CI green (run the Visual baselines workflow once) and the release page checked.

Improvements:

- [x] 105 [M] Machine as a field: the Project input in the editor is a combobox over the known machines, free text still allowed; a BOM task with a machine and no project offers Use <machine> once.
- [x] 106 [S] Size the day: open cards without effort get four quiet chips (half an hour to four hours) on the hover toolbar; a sized card shows its value and cycles through the sizes on click.
- [x] 107 [S] Notification history: every server notification lands in a per-user history; the bell in the nav shows the unread dot and the last twenty, each opening what it referred to, with Mark all read.
- [x] 108 [S] The brief knows about chases and drift: To chase and The sheet differs sections, the drift check raced against three seconds so the brief never waits.
- [x] 109 [L] SQLite behind the store as an opt-in engine: server/db.js chooses json (default) or sqlite from BENCH_STORAGE, which the desktop sets from machine.json storage; a migrate command copies either way; better-sqlite3 pinned to the 12 line because 13 crashes Electron 33's Node, and the build fetches the Electron prebuild before packaging. Verified under Node, still to be verified inside the packaged app.

Integrations:

- [-] 110 [L] The team's bench. Skipped on 23 Sep 2026 until a second person joins the share.
- [x] 111 [M] Bench speaks MCP: scripts/mcp.mjs is a Model Context Protocol server over stdio, written by hand without an SDK, with twelve read and write tools (tasks, Logbook, machines, review, hours, brief, search) and no delete; it finds the running Bench through the port file in the user folder. docs/mcp.md has the Claude Code and Claude Desktop setup. Data stays on the machine.
- [x] 112 [L] Machine passport: GET /api/machines/:key/passport merges tasks, orders, deliveries, Issues and QMS tickets, Logbook entries and decisions and maps into one timeline; the detail page shows it and #/machines?m=<key>&print=1 renders a printable black-on-white version.
- [x] 113 [M] Procurement that reads the mail: with Mail.Read (admin consent once more) and the switch in Settings > Tools, order confirmations and delivery notes in Outlook set ordered-on and delivered-on for tasks with a supplier and a PO; a Suppliers panel on Procurement shows open POs, median lead time and on-time rate.
- [x] 114 [M] Commissioning playbooks at #/playbooks: templates create the standard task set for a machine (Today cap respected), a starter template ships, and a finished machine becomes a template with New from machine.
- [x] 115 [S] Cost per machine on Review: hours by machine and month over 3, 6 or 12 months, CHF when the hourly rate in Settings > Hours is set, and a semicolon CSV for the controller.
- [x] 116 [M] A phone view on the workshop network: with Phone access and a PIN in Settings > Tools, a second server on port 5199 serves the brief, Today ticks, the valid punches, quick add and a camera input that drops photos into the inbox; ten wrong PINs lock the address for five minutes.
- [x] 117 [M] The Innovation dashboard as a connected tool: sign-in like QMS and the BOM, then a two-stage discovery on the first sync, the page's own API calls first and a reading of the page as fallback, with the field names and endpoints seen stored on the source status. The mapping is a guess until the real page has been synced once.

