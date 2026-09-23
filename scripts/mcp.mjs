#!/usr/bin/env node
/**
 * Bench as an MCP server over stdio (roadmap 111).
 *
 *   claude mcp add bench -- node <repo>\scripts\mcp.mjs
 *
 * Talks to the running Bench on 127.0.0.1; the port comes from BENCH_PORT or the port file Bench writes
 * at start. Nothing here reads the data files, so it is safe to run while the app is open.
 * Logs go to stderr only: stdout belongs to the protocol.
 */
import { serve, readPort } from '../server/mcp.js'

const base = `http://127.0.0.1:${readPort()}`
process.stderr.write(`[bench-mcp] talking to ${base}\n`)
serve({ base })
