# Bench.

## Download

**[Download the latest installer](https://github.com/jensenoe/Bench./releases/latest)**, then:

1. On that page, open **Assets** and click **Bench-Setup-…exe**.
2. Run it. Windows says *Windows protected your PC* because the installer is not signed: click **More info**, then **Run anyway**.
3. Next, Next, Install. No admin rights; it installs into your own profile.
4. First start asks for your name and work email, then offers the Microsoft 365 sign-in.

Installing over an older Bench keeps your board, hours and settings. `Bench-portable-…exe` on the
same page is the no-install version: keep it in any folder and run it from there.

---

**Beta 3 (0.9.0-beta.3).** Everything here works on my machine and on the mocks; the
Microsoft paths (Planner, the hours workbook, the issue list, the calendar) still want a
first real run in the tom.fit tenant, and the issue list and calendar need a one-time admin
approval, see below.

A small board I built so my whole bench fits on one screen. Planner, Teams, the issue
tracker, the QMS and the BOM tool each held a piece of the day and nothing showed all
of it at once. Bench. reads what those tools have assigned to you, puts it in five lanes
with a hard cap on Today, clocks your hours into the Zeiterfassung workbook, and keeps
its data in a plain file you can drop on a shared drive. Built at TomFit for my own bench
first; if it helps yours too, good.

The pictures follow the sky: dawn, day, dusk and night are set by the real sunrise and
sunset in Oetwil am See, and the photograph changes every twenty minutes, from whichever
libraries you switch on.

---

## Install

The installer above is the normal way in. The other way builds it on your own machine:
*Code > Download ZIP*, unpack it anywhere, double-click `install-bench.bat`. It installs
Node.js if the machine has none (through winget), fetches the packages and the photographs,
builds the app and then starts the same installer. Ten to fifteen minutes the first time,
mostly downloads; the unpacked folder can be deleted afterwards. Neither way needs admin rights.

An installed Bench keeps the board in your profile until **Settings > This machine > Choose
a shared folder**; after a restart everyone pointing at that folder sees the same list. Your
hours, sign-ins and settings never enter that folder.

### Building it

`build-exe.bat` needs Node LTS. It installs dependencies, fetches the photographs, builds
the interface and packages both executables into `release\`. If packaging stops at *Cannot
create symbolic link*, turn on Windows Developer Mode or run the script once as
Administrator; `build-exe.bat plain` skips the icon stamping instead, and `build-exe.bat auto`
(what `install-bench.bat` uses) falls back to that by itself and never pauses.

### Publishing a release

Bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v0.9.0-beta.2 && git push --tags
```

The *Release* workflow in `.github/workflows/release.yml` builds both exes on a Windows
runner, runs the tests and lint, and attaches the exes to a GitHub release (marked
pre-release while the version carries a suffix). *Actions > Release > Run workflow* builds
without publishing and leaves the exes as a workflow artifact.

## Everyday

- **Keyboard.** `n` adds a task from anywhere (Alt 1 to 5 picks the lane, Enter adds). `/` or
  Ctrl K searches tasks, notes, maps and pages. `1` to `7` switch pages. Escape closes whatever is open.
- **Drag and drop.** Cards move between lanes by dragging; the lane lights up when it will take the
  card, red when Today is full. The lane menu on the card still works.
- **Today is a rule.** Five open tasks. The server refuses a sixth from you with "Today is full";
  a sync may still land a due-today ticket there, and the lane says so.
- **Checklists, repeats, procurement.** The sliders on a card open every field: a checklist ticked
  from the card, a repeat (daily, weekly, fortnightly, monthly) that leaves the next occurrence behind
  when you complete one, and supplier, PO number and ordered-on for parts with a lead time.
- **Whose work.** Once tasks carry other people's names as lead, a Whose row appears above the
  lanes: mine, everyone, or one person. Mine means no lead, or a lead that is you.
- **Sync feedback.** Connected tools sync every two minutes; when that brings or closes something,
  a quiet toast says how many and from where.
- **Hours.** The time clock is one control in the nav: the state, the one action that fits the hour,
  and a panel with the rest. `#/hours` shows the month the way the Zeiterfassung sheet has it, with
  punches that still wait to be written and any that failed, in plain words. A day left open is
  offered for closing at the next start, with the out time you choose, written to that day's row.
- **Tray.** Closing the window hides it; Bench keeps running so the 12:00 toast and the 12:30
  auto-end fire. Quit from the tray menu. `machine.json` `"closeToTray": false` restores the old way.
- **Updates.** Settings > About checks GitHub for a newer release. The repository is private, so a
  fine-grained token with read access makes the check real; without one the button opens the
  releases page. A newer version is also announced once at start.
- **Napkin and Logbook.** A node becomes a task with `T` or the button; the map exports as PNG or
  SVG. A recurring meeting starts from its last entry with *Again today*.

## The four tools

| Tool | How it's read | Sign-in |
|---|---|---|
| **Phase Gate** (innovation.tom.fit) | Microsoft Planner via Graph, `/me/planner/tasks` | Connect Planner, once. Device code. |
| **Issue tickets** (issues.tom.fit) | The site's SharePoint list, read directly through Graph with your Microsoft 365 sign-in (`Sites.Read.All`). Assignees matched on the name and email in Settings. | Connect Microsoft 365 in Settings. No separate sign-in. |
| **QMS** (tf-hw-qms) | `GET /api/tickets`, matched on your name | Tools → Sign in. SSO. |
| **Structured BOM** (oetwil-structured-bom) | `GET /api/machine/{id}` for every machine, any `assigned_to*` matching you | Tools → Sign in. SSO. |

Sign-in opens a window to the tool; your Microsoft SSO carries you through; the window
closes itself and the session is kept for future launches. Each panel reports what the
last sync saw: how many items are in the tool and how many are assigned to you, so an
empty panel is a fact, not a failure. Sync is always available; Sign in appears when the
tool asked for one.

**Cockpit** (`cockpit.tom.fit`) has its own door on the landing page and opens in a
separate window on the same kept session. Connected tools sync every 2 minutes
while the app is open, or on demand from the Tools page.

**What syncs and what doesn't.** The tool owns the title, the status and whether it's
done. You own the lane, notes, order-by date and waiting-on. A sync never overwrites
yours. Completing a Planner task here completes it in Planner; the other three are
read-only, so ticking one here only marks it done on your board.

### Microsoft 365 app registration

The TomFit registration ("Project Management Tool", a public client with device-code
flow) is built in, so an installed copy needs no configuration: press *Connect* in
Settings, a Microsoft page opens, the code is already on your clipboard, and Bench.
notices by itself when the sign-in lands. A `.env` beside the exe or in the project
folder can still override it for another tenant:

```
AZURE_CLIENT_ID=<another app id>
AZURE_TENANT_ID=<its tenant>
SYNC_INTERVAL_MINUTES=2
# Time clock target. Default: Documents/TomFit_Zeiterfassung_<year>_<name>.xlsx in your OneDrive.
# TIMESHEET_PATH=Documents/TomFit_Zeiterfassung_2026_Noel Jensen.xlsx
# TIMESHEET_URL=<a OneDrive sharing link to the workbook, wins over the path>
```

The registration has *Allow public client flows* on. The app asks for `Tasks.ReadWrite` (Planner),
`Files.ReadWrite` (the Zeiterfassung workbook), `Sites.Read.All` (the issue-ticket list) and
`Calendars.Read` (today's meetings for the Logbook); all four are user-consentable, and
Microsoft asks once when a new one is added. If you were
connected before the time clock existed, the pill goes back to *Connect* once: sign in
again and consent to the second scope.

## Time clock

The time clock in the nav shows the state and the one action that fits the hour (**Clock in**, **Lunch**, **Back**, **Clock out**); the panel behind it has the rest and a link to the month;
at noon the pill itself turns into Lunch. Clock in rounds **down** to five minutes (08:08
becomes 08:05), clock out rounds **up** (17:01 becomes 17:05), and the two lunch punches are
the exact minute so the break is what it was. Everything is written straight into the month sheet of
`TomFit_Zeiterfassung_<year>_Noel Jensen.xlsx` on your OneDrive:

| Punch | Cell |
|---|---|
| Clock in | C, *Vormittag kommt* |
| Lunch | D, *Vormittag geht* |
| Back | E, *Nachmittag kommt*, and G (*Pause*) set to 0:00 so the break is not counted twice |
| Clock out | F, *Nachmittag geht* |

The row is found by reading the date column, so a reshuffled sheet still lands on the
right day. Rules: a desktop notification fires at **12:00** on weekdays; a break that
starts before 12:30 **ends at 12:30 by itself**; a break that starts later is ended with
*Back*. One break per day goes through the sheet; a second one is yours to type into
*Pause*. Punches made offline or before signing in wait and are written on the next tick
(the amber dot next to the pill). `#/lunch` is the break screen: a village at dusk and
one big number.

Before seven the greeting changes register (quiet hours, first in, coffee first). Still
clocked in after 19:00, or past ten hours, and the landing page opens with a line to the
effect that tomorrow is a day as well; the reminder chip says the same.

A quiet reminder fades in under the punch a minute after start: not clocked in on a weekday
morning, still clocked in after 17:15 or nine and a half hours. The cross puts it away for the day.

Today's punches live in your user profile, not in the shared data folder, so a colleague
opening the same board sees the tasks and not your hours. **Reset today** in Settings > Hours
forgets the local punches; the sheet keeps whatever was written.

**Starts with Windows** (Settings > This machine) is on by default for the built `.exe`. A `settings.json`
beside the exe with `{ "startup": false }` turns the default off for everyone.

## Settings

The gear at the top right. Everything adjustable is there, saved as you change it:

- **Look**: dark or light; follow the clock or pin a time of day; which picture libraries
  rotate. Any mix of Alps, Tropics (Bali, Hawaii, Maldives, Thailand, Seychelles, jungle
  close-ups), Urban (New York, Hong Kong, London, Zürich), Monochrome architecture, Pacific
  Northwest (fog, rain, coffee), Desert (Morocco, with the big sunsets at dusk), Brutalist
  (raw concrete, hard shadows), Italian coast (Positano, Amalfi, Cinque Terre, coloured
  houses over the sea), Canada (Banff, Moraine Lake, Yukon aurora), Autumn (roads through
  golden trees) and Gothic (Edinburgh, old libraries, dark academia). A new picture every
  20 minutes by default, or 10, 30 or 60; the mapping shifts daily.
- **You**: name as the tools spell it, and email. Both are used to find what Issues, QMS
  and the BOM assign to you. The greeting uses the first name.
- **Hours**: the workbook path in your OneDrive, in the same shape as the Excel file name
  (`{year}` and `{name}` are filled in), or a sharing link; lunch reminder and lunch end;
  rounding.
- **This machine**: where the board lives, run at sign-in, water and coffee reminders.
- **Microsoft 365**: connect or disconnect.

## The week, search, digest, backups

**The week** on Home: seven columns, hours on the clock as bars, tasks ticked off here as
dots, a logbook entry as a small mark. Today fills in live; closed days come from the punch
history kept in your profile (90 days).

**Search**: Ctrl K (or the magnifier) opens one box over tasks, logbook entries, napkin nodes
and pages. Arrows and Enter; a task result jumps to it on the board and outlines it briefly.

**Morning digest**: once per weekday morning, if there is anything to say, one desktop
notification: order dates inside three days, items with other people for over a week, an
Innovation lane that has not moved in three weeks.

**Backups**: the first save of each day copies `tasks.json`, `logbook.json` and `napkin.json`
into `backups/` next to them, kept 30 days. If two people on the same folder ever write over
each other, yesterday is one file away.

**Completing a tool's task** here marks it done on the board only (Planner is the exception
and is written back). The completion toast says so and offers to open the ticket in the tool
so you can close it where it counts.

**Logbook from the calendar**: the calendar button on the Logbook lists today's Outlook
meetings (`Calendars.Read`); one click starts an entry with the title, attendees, time and
room filled in.

## Logbook and Napkin

**Logbook** is meeting notes: one entry per meeting with date, attendees, project, free notes,
decisions (one per line) and actions with an owner and a tick box. An action goes to the
board with one click and arrives in Active with *assigned by* set to the meeting; the entry
keeps a link back. Search covers titles, notes, names and projects.

**Napkin** is mind maps that lay themselves out. One idea in the middle, branches alternating
right and left. Tab makes a child, Enter a sibling, double-click edits, Delete removes a
branch, Space folds one, C cycles a colour through it, drag pans, wheel zooms. Several maps
per napkin.

Both live in the shared data folder (`logbook.json`, `napkin.json`) beside the tasks, so a
colleague on the same folder sees the same notes and maps. Procurement, Logbook and Napkin
each show a short walk-through the first time they open; Settings can bring them back.

## Lanes

| Lane | Rule |
|---|---|
| **Today** | Five slots. A sixth is refused until one leaves; only a sync may land a due-today ticket there. |
| **Innovation** | Shows days since each item moved; flags the lane past 14. |
| **Waiting on** | Ages from the day it left your hands. Red past a week. |
| **Active** | In flight, not today. Today pulls from here. |
| **Parked** | Shelved on purpose, kept visible. |

Every task opens (click the title or the sliders icon) into the full set of fields:
**assigned by**, **lead**, **project**, **priority** (P1 now, P2 this week, P3 when there
is room), **effort** in hours, **due**, **order by**, **waiting on**, **tags**, **notes**.
Edits save as you type. For tasks that come from a tool, the tool owns the title, due
date and status; the rest is yours and survives every sync. Issues and QMS suggest
*assigned by* from the reporter; typing your own wins.

Above the lanes, a row of chips filters the board by source: everything, added here,
Phase Gate, Issues, QMS, BOM. Counts are open items.

Ticking a task off shows a short line of encouragement (sixty-odd, some borrowed from
people who said it better) and a nudge towards water or coffee. The nudge can be turned
off in Settings.

**Order by** is the last day an order can go out and still land before the build needs
the part. Anything inside 7 days surfaces on Home and Procurement.

## Photographs

302 photographs from Pexels and Unsplash, free licences, fetched by `fetch-photos.bat`
and shipped inside the installer. Eleven libraries share the clock (Alps, Tropics, Urban,
Monochrome, Pacific Northwest, Desert, Brutalist, Italian coast, Canada, Autumn, Gothic;
24 to 39 each across dawn, day, dusk and night),
four alpine villages at dusk for the lunch screen, and five offices and benches for the
Cockpit door. Photo URLs and photographers are in `src/library.json`; swap any you dislike
and rerun the fetch. Plus one of yours on the Board.
