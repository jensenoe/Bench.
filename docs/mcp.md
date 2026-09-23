# Bench speaks MCP.

Bench runs a small Model Context Protocol server so Claude can read and write the board, the Logbook,
the machines, the hours and the review. It is `scripts/mcp.mjs`, a plain Node script over stdio with
JSON-RPC 2.0 and protocol version `2025-03-26`. There is no SDK and no network: the script talks to the
Bench that is already running on this machine through `http://127.0.0.1:<port>`, so every write goes
through the same routes the UI uses, the Today cap holds, and the change feed records what Claude did.

Data stays local. Nothing leaves the machine except what you type into Claude yourself; the MCP server
never uploads the board, and Claude only sees what a tool returns for the question you asked.

## Finding the port.

The desktop app picks a free port at start and writes it to `%APPDATA%\bench\user\port`. The script
reads `BENCH_PORT` first, then that file, then `./data/port` for a dev checkout, then falls back to 5178
(`npm start`). Bench has to be running; when it is not, every tool answers "Bench is not running".

## Claude Code.

    claude mcp add bench -- node C:\Users\Noel\PycharmProjects\mountain-dashboard\scripts\mcp.mjs

Check with `claude mcp list`. Remove with `claude mcp remove bench`.

## Claude Desktop.

Settings, Developer, Edit Config, then add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bench": {
      "command": "node",
      "args": ["C:\Users\Noel\PycharmProjects\mountain-dashboard\scripts\mcp.mjs"]
    }
  }
}
```

Restart Claude Desktop afterwards. The installed app works too: point `args` at the `scripts\mcp.mjs`
inside the unpacked resources, or keep a checkout of the repo for this one file.

## Tools.

Every tool answers with one text block of compact JSON. Dates are `YYYY-MM-DD`. Lanes are `today`,
`active`, `waiting`, `innovation`, `parked`. There is no delete tool on purpose.

| Tool | What it does |
|---|---|
| `list_tasks({ lane?, project?, open? })` | Tasks on the board, open ones by default. `open: false` lists done ones. |
| `create_task({ title, lane?, project?, dueDate?, orderBy?, supplier?, poNumber?, effortHours?, notes?, checklist?, tags?, priority?, waitingOn? })` | One new task. When Today is full it lands in Active and the answer says so. |
| `update_task({ id, ...fields })` | Changes fields on a task: title, lane, dates, project, supplier, PO, effort, notes, checklist, tags, priority. |
| `complete_task({ id })` | Ticks a task. A Planner task is completed upstream too, as from the UI. |
| `list_logbook({ project?, since? })` | Logbook entries, newest first. |
| `create_logbook_entry({ title, date?, attendees?, project?, notes?, decisions?, actions? })` | A new entry. Actions are `{ text, owner?, due? }`. |
| `list_machines()` | The machines with open, late, orders, waiting, logbook counts and last activity. |
| `machine_detail({ key })` | One machine: tasks by lane, orders, entries, maps, mentions. The key or the display name both work. |
| `week_review({ start? })` | The weekly review, figures and the plain-text summary. |
| `hours_month({ ym? })` | The time clock for one month. |
| `day_brief()` | The morning brief: leftovers, arrivals, due, order dates, meetings, the sheet. |
| `search({ q })` | Tasks, Logbook entries and napkin maps whose text contains the words. |

## Protocol notes.

Handled: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Everything else
answers `-32601`. A tool that fails (Bench not running, unknown id, a refused write) answers a normal
result with `isError: true` and one sentence, never a JSON-RPC error, so Claude can read it and move on.
