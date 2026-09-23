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
- [ ] 9 [L] Procurement fed by the BOM. Done: supplier, PO number and ordered-on on every task and on the Procurement rows; a "From the BOM" section fed by the adapter (see 34). Open: confirm the BOM field names for supplier, lead time, order and delivery dates against the real tool, then the section fills itself.
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
- [ ] 23 [-] The noon black screen: read `bench.log` after the next occurrence. Instrumentation is in place.

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
