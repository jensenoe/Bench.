import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, ArrowsOut, Export, ArrowRight } from '@phosphor-icons/react'
import * as api from '../api.js'

/**
 * Napkin: mind maps that lay themselves out. A centre idea, branches to the right and left,
 * every node editable in place.
 *
 *   click        select          double-click / F2   edit
 *   Tab          child           Enter               sibling
 *   Delete       remove branch   Escape              stop editing
 *   drag         pan (background)   wheel            zoom
 *   drag a node  into open space: stays there (its branch follows); onto another: becomes its child;
 *                between neighbours in a column: reorders. Tidy puts everything back on the grid.
 *
 * Layout is a classic two-sided tree: first-level branches alternate right and left, each
 * subtree gets vertical room by its leaf count. Saved to the shared folder, debounced.
 */
const NODE_W = 180, NODE_H = 36, GAP_X = 70, GAP_Y = 12
const PALETTE = { accent: 'var(--accent)', rose: '#F0776B', amber: '#E8B85A', mint: '#8CD3A2', sky: '#7CC8DA', plum: '#C9A2F0' }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

/** Positions for every visible node. Children sorted by order; collapsed nodes hide their subtree. */
function layout(nodes, root) {
  const kids = (id) => Object.values(nodes).filter(n => n.parent === id).sort((a, b) => a.order - b.order)
  const leaves = (id) => { const k = nodes[id].collapsed ? [] : kids(id); return k.length ? k.reduce((s, c) => s + leaves(c.id), 0) : 1 }
  const pos = {}
  const place = (id, x, yTop, dir) => {
    const total = leaves(id) * (NODE_H + GAP_Y)
    pos[id] = { x, y: yTop + total / 2 - NODE_H / 2, dir }
    let y = yTop
    if (!nodes[id].collapsed) for (const c of kids(id)) {
      const h = leaves(c.id) * (NODE_H + GAP_Y)
      place(c.id, x + dir * (NODE_W + GAP_X), y, dir); y += h
    }
  }
  const first = kids(root)
  const right = first.filter((_, i) => i % 2 === 0), left = first.filter((_, i) => i % 2 === 1)
  const side = (list, dir) => {
    const total = list.reduce((s, c) => s + leaves(c.id) * (NODE_H + GAP_Y), 0)
    let y = -total / 2
    for (const c of list) { const h = leaves(c.id) * (NODE_H + GAP_Y); place(c.id, dir * (NODE_W + GAP_X), y, dir); y += h }
  }
  side(right, 1); side(left, -1)
  pos[root] = { x: 0, y: -NODE_H / 2, dir: 0 }
  // hand-placed nodes: the offset a node was dragged by, inherited by its whole branch
  const shift = (id, dx, dy) => {
    const n = nodes[id]; dx += n.dx || 0; dy += n.dy || 0
    if (pos[id] && (dx || dy)) { pos[id] = { ...pos[id], x: pos[id].x + dx, y: pos[id].y + dy, moved: true } }
    for (const c of kids(id)) shift(c.id, dx, dy)
  }
  shift(root, 0, 0)
  return pos
}

export default function Napkin() {
  const [maps, setMaps] = useState(null)
  const [sel, setSel] = useState(null)
  const [nodes, setNodes] = useState(null)
  const [root, setRoot] = useState(null)
  const [active, setActive] = useState(null)
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [dirty, setDirty] = useState(false)
  const svgRef = useRef(null), drag = useRef(null), saveTimer = useRef(null)
  const nodeDrag = useRef(null)                 // { id, sx, sy } from mousedown on a node
  const [ghost, setGhost] = useState(null)      // { id, x, y, target: { id, mode } } while a node is being dragged
  const [note, setNote] = useState(null)        // one line of feedback under the toolbar (exported, sent to the board)

  const load = async () => { const m = await api.getMaps(); setMaps(m); return m }
  useEffect(() => { load().then(m => {
    const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('map')
    const pick = m.find(x => x.id === wanted) || m[0]
    if (pick) open(pick)
  }) }, [])
  const open = (m) => { setSel(m.id); setNodes(m.nodes); setRoot(m.root); setActive(m.root); setEditing(null); setView({ x: 0, y: 0, k: 1 }); setDirty(false) }
  const map = maps?.find(m => m.id === sel)

  // debounced save
  useEffect(() => {
    if (!dirty || !sel || !nodes) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => { const m = await api.patchMap(sel, { nodes, root }); setMaps(list => list.map(x => x.id === m.id ? m : x)); setDirty(false) }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [nodes, root, sel, dirty])

  const change = useCallback((fn) => { setNodes(n => fn({ ...n })); setDirty(true) }, [])
  const addChild = (pid) => { const id = uid(); const order = Object.values(nodes).filter(n => n.parent === pid).length; change(n => ({ ...n, [id]: { id, text: '', parent: pid, color: null, collapsed: false, order } })); if (nodes[pid]?.collapsed) change(n => ({ ...n, [pid]: { ...n[pid], collapsed: false } })); setActive(id); setEditing(id) }
  const addSibling = (id) => { const p = nodes[id]?.parent; if (!p) return addChild(id); const nid = uid(); change(n => ({ ...n, [nid]: { id: nid, text: '', parent: p, color: null, collapsed: false, order: (n[id].order || 0) + 0.5 } })); setActive(nid); setEditing(nid) }
  const remove = (id) => {
    if (id === root) return
    const parent = nodes[id].parent
    change(n => { const drop = (x) => { for (const c of Object.values(n).filter(c => c.parent === x)) drop(c.id); delete n[x] }; drop(id); return n })
    setActive(parent); setEditing(null)
  }
  const setText = (id, text) => change(n => ({ ...n, [id]: { ...n[id], text } }))
  const cycleColor = (id) => { const keys = [null, ...Object.keys(PALETTE)]; const cur = nodes[id].color; change(n => ({ ...n, [id]: { ...n[id], color: keys[(keys.indexOf(cur) + 1) % keys.length] } })) }
  const toggle = (id) => change(n => ({ ...n, [id]: { ...n[id], collapsed: !n[id].collapsed } }))
  const say = (text) => { setNote(text); clearTimeout(say.t); say.t = setTimeout(() => setNote(null), 4000) }
  /** The selected node becomes a task in the Active lane; the node remembers it. */
  const toBoard = async (id) => {
    if (!id || id === root || !map) return
    if (nodes[id]?.taskId) { location.hash = `#/board?task=${nodes[id].taskId}`; return }
    try {
      const r = await api.nodeToBoard(map.id, id)
      setMaps(list => list.map(x => x.id === r.map.id ? r.map : x)); setNodes(r.map.nodes)
      say(`On the board: ${r.task.title}`)
    } catch (e) { say(e.message) }
  }

  const pos = useMemo(() => nodes && root ? layout(nodes, root) : {}, [nodes, root])

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (!nodes || !active) return
      if (editing) { if (e.key === 'Escape') { setEditing(null) } return }
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'Tab') { e.preventDefault(); addChild(active) }
      else if (e.key === 'Enter') { e.preventDefault(); addSibling(active) }
      else if (e.key === 'F2') { e.preventDefault(); setEditing(active) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(active) }
      else if (e.key === ' ') { e.preventDefault(); toggle(active) }
      else if (e.key === 'c') { cycleColor(active) }
      else if (e.key === 't') { toBoard(active) }
    }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  })

  // pan and zoom (background only) and node dragging
  const toMap = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left - r.width / 2 - view.x) / view.k, y: (e.clientY - r.top - r.height / 2 - view.y) / view.k }
  }
  const isDescendant = (id, of) => { let c = nodes[id]; while (c?.parent) { if (c.parent === of) return true; c = nodes[c.parent] } return false }
  /** Where a dragged node would land: on a node (child of it), or in a column between neighbours (sibling order). */
  const dropTarget = (id, m) => {
    for (const [tid, p] of Object.entries(pos)) {
      if (tid === id || isDescendant(tid, id)) continue
      const x = tid === root ? -NODE_W / 2 : p.x
      if (m.x >= x && m.x <= x + NODE_W && m.y >= p.y && m.y <= p.y + NODE_H) return { id: tid, mode: 'child' }
    }
    // same column: nearest node by y decides before/after among its siblings
    let best = null
    for (const [tid, p] of Object.entries(pos)) {
      if (tid === id || tid === root || isDescendant(tid, id)) continue
      if (Math.abs(m.x - (p.x + NODE_W / 2)) > NODE_W / 2) continue
      const d = Math.abs(m.y - (p.y + NODE_H / 2))
      if (!best || d < best.d) best = { id: tid, d, mode: m.y < p.y + NODE_H / 2 ? 'before' : 'after' }
    }
    return best && best.d < NODE_H + GAP_Y ? { id: best.id, mode: best.mode } : null
  }
  const applyDrop = (id, t, m) => {
    if (!t) {
      // dropped in open space: keep it there, as an offset from where the layout would put it
      const p = pos[id]; if (!p || !m) return
      const cur = nodes[id]
      change(n => ({ ...n, [id]: { ...n[id], dx: (cur.dx || 0) + (m.x - NODE_W / 2 - p.x), dy: (cur.dy || 0) + (m.y - NODE_H / 2 - p.y) } }))
      return
    }
    change(n => {
      if (t.mode === 'child') {
        const order = Object.values(n).filter(c => c.parent === t.id).length
        n[id] = { ...n[id], parent: t.id, order }
        if (n[t.id].collapsed) n[t.id] = { ...n[t.id], collapsed: false }
      } else {
        const sib = n[t.id]
        n[id] = { ...n[id], parent: sib.parent, order: (sib.order || 0) + (t.mode === 'before' ? -0.5 : 0.5) }
      }
      n[id] = { ...n[id], dx: 0, dy: 0 }   // back on the grid once it has a new place in the tree
      // renumber the affected sibling lists so orders stay integers
      for (const pid of new Set([n[id].parent])) Object.values(n).filter(c => c.parent === pid).sort((a, b) => a.order - b.order).forEach((c, i) => { n[c.id] = { ...c, order: i } })
      return n
    })
  }
  const onDown = (e) => { if (e.target === svgRef.current || e.target.dataset.bg) { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; setEditing(null) } }
  const onNodeDown = (e, id) => {
    e.stopPropagation(); setActive(id)
    if (id !== root && editing !== id && e.button === 0) nodeDrag.current = { id, sx: e.clientX, sy: e.clientY }
  }
  const onMove = (e) => {
    if (drag.current) return setView(v => ({ ...v, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) }))
    const d = nodeDrag.current
    if (!d) return
    if (!ghost && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return
    const m = toMap(e)
    setGhost({ id: d.id, x: m.x, y: m.y, target: dropTarget(d.id, m) })
  }
  const onUp = () => {
    drag.current = null
    if (ghost) applyDrop(ghost.id, ghost.target, { x: ghost.x, y: ghost.y })
    nodeDrag.current = null; setGhost(null)
  }
  const onWheel = (e) => { const k = Math.min(2.2, Math.max(.4, view.k * (e.deltaY < 0 ? 1.08 : .93))); setView(v => ({ ...v, k })) }
  const fit = () => {
    const ps = Object.entries(pos); if (!ps.length) return setView({ x: 0, y: 0, k: 1 })
    const xs = ps.map(([id, p]) => id === root ? -NODE_W / 2 : p.x), ys = ps.map(([, p]) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W, minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H
    const W = svgRef.current?.clientWidth || 900, H = svgRef.current?.clientHeight || 500
    const k = Math.min(1.1, Math.max(.5, Math.min((W - 80) / (maxX - minX || 1), (H - 120) / (maxY - minY || 1))))
    setView({ x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k, k })
  }
  useEffect(() => { if (nodes) fit() }, [sel])   // eslint-disable-line react-hooks/exhaustive-deps

  /** The map as a standalone picture, in the current theme's colours. */
  const svgString = () => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb)
    const ink = v('--ink', '#F3F3F1'), row = v('--row', '#25262F'), panel = v('--panel', '#1E1F27'), line = v('--line-2', 'rgba(243,243,241,.14)'), accent = v('--accent', '#8CC4F5'), bg = v('--bg', '#15161C'), ink3 = v('--ink-3', 'rgba(243,243,241,.48)')
    const col = c => c ? (c === 'accent' ? accent : PALETTE[c]) : null
    const ps = Object.entries(pos); if (!ps.length) return null
    const xs = ps.map(([id, p]) => id === root ? -NODE_W / 2 : p.x), ys = ps.map(([, p]) => p.y)
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + NODE_W + 40, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + NODE_H + 40
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}" font-family="Work Sans, Segoe UI, Helvetica, Arial, sans-serif" font-size="13">`
    out += `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${panel}"/>`
    for (const n of Object.values(nodes)) {
      if (!n.parent || !pos[n.id] || !pos[n.parent]) continue
      const a = pos[n.parent], b = pos[n.id]
      const x1 = a.dir === 0 ? (b.dir > 0 ? NODE_W / 2 : -NODE_W / 2) : (a.dir > 0 ? a.x + NODE_W : a.x), y1 = a.y + NODE_H / 2
      const x2 = b.dir > 0 ? b.x : b.x + NODE_W, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2
      out += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${col(n.color || nodes[n.parent].color) || ink3}" stroke-width="1.5" opacity=".8"/>`
    }
    for (const n of Object.values(nodes)) {
      const p = pos[n.id]; if (!p) continue
      const isRoot = n.id === root, x = isRoot ? -NODE_W / 2 : p.x, c = col(n.color)
      out += `<rect x="${x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="${isRoot ? 18 : 10}" fill="${isRoot ? ink : row}" stroke="${c || line}"/>`
      if (c && !isRoot) out += `<rect x="${x}" y="${p.y + 8}" width="3" height="${NODE_H - 16}" rx="1.5" fill="${c}"/>`
      const text = (n.text || 'New idea'), shown = text.length > 24 ? text.slice(0, 23) + '…' : text
      out += `<text x="${isRoot ? x + NODE_W / 2 : x + 12}" y="${p.y + NODE_H / 2 + 4.5}" text-anchor="${isRoot ? 'middle' : 'start'}" font-weight="${isRoot ? 600 : 400}" fill="${isRoot ? bg : ink}">${esc(shown)}</text>`
    }
    return out + '</svg>'
  }
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }
  const exportMap = (kind) => {
    const svg = svgString(); if (!svg || !map) return
    const name = (map.title || 'napkin').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'napkin'
    if (kind === 'svg') { download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`); return say('Saved as SVG.') }
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2
      const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0)
      c.toBlob(b => { download(b, `${name}.png`); say('Saved as PNG.') }, 'image/png'); URL.revokeObjectURL(url)
    }
    img.onerror = () => say('The picture could not be drawn.')
    img.src = url
  }

  const newMap = async () => { const m = await api.createMap({ title: 'New map' }); await load(); open(m); setEditing(m.root) }
  const rename = async (title) => { if (!map || title === map.title) return; const m = await api.patchMap(map.id, { title }); setMaps(list => list.map(x => x.id === m.id ? m : x)) }
  const removeMap = async () => { if (!map || !confirm(`Delete "${map.title}"?`)) return; await api.removeMap(map.id); const list = await load(); list.length ? open(list[0]) : (setSel(null), setNodes(null)) }

  if (!maps) return <main className="mx-auto col px-6 py-10 text-[13px]" style={{ color: 'var(--ink-3)' }}>Loading</main>

  return (
    <main className="mx-auto col px-6">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {maps.map(m => (
          <button key={m.id} onClick={() => open(m)} className="pill max-w-[220px] truncate px-3 py-1.5 text-[13.5px] transition-colors"
            style={{ color: m.id === sel ? 'var(--ink)' : 'var(--ink-3)', background: m.id === sel ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: '1px solid var(--line)' }}>{m.title}</button>
        ))}
        <button onClick={newMap} className="pill flex items-center gap-1.5 px-3 py-1.5 text-[13.5px]" style={{ background: 'var(--ink)', color: 'var(--bg)' }}><Plus size={12} weight="bold" /> New map</button>
      </div>

      {map && nodes ? (
        <section className="panel relative overflow-hidden" style={{ height: '72vh', minHeight: 480 }}>
          <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
            <input key={map.id} defaultValue={map.title} onBlur={e => rename(e.target.value.trim() || map.title)} onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              className="display bg-transparent text-[20px] font-semibold tracking-tight outline-none" />
            <span className="tnum text-[13px]" style={{ color: 'var(--ink-3)' }}>{Object.keys(nodes).length} nodes{dirty ? ' · saving' : ''}</span>
            {note && <span className="text-[13.5px]" style={{ color: 'var(--accent)' }}>{note}</span>}
          </div>
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
            {Object.values(nodes).some(n => n.dx || n.dy) && (
              <button onClick={() => change(n => { for (const k of Object.keys(n)) if (n[k].dx || n[k].dy) n[k] = { ...n[k], dx: 0, dy: 0 }; return n })} title="Put every node back on the grid"
                className="pill px-2.5 py-1 text-[13px]" style={{ color: 'var(--ink-3)', border: '1px solid var(--line)' }}>Tidy</button>
            )}
            {active && active !== root && nodes[active] && (
              <button onClick={() => toBoard(active)} title={nodes[active].taskId ? 'Open its task on the board' : 'Make a task of this node (T)'} className="pill flex items-center gap-1.5 px-2.5 py-1 text-[13px]" style={{ color: nodes[active].taskId ? 'var(--ink-3)' : 'var(--accent)', border: '1px solid var(--line)' }}>
                {nodes[active].taskId ? 'On the board' : 'To the board'} <ArrowRight size={11} weight="bold" />
              </button>
            )}
            <button onClick={() => exportMap('png')} title="Save as PNG" className="pill flex items-center gap-1.5 px-2.5 py-1 text-[13px]" style={{ color: 'var(--ink-3)', border: '1px solid var(--line)' }}><Export size={12} /> PNG</button>
            <button onClick={() => exportMap('svg')} title="Save as SVG" className="pill px-2.5 py-1 text-[13px]" style={{ color: 'var(--ink-3)', border: '1px solid var(--line)' }}>SVG</button>
            <button onClick={fit} title="Reset view" className="grid h-7 w-7 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><ArrowsOut size={14} /></button>
            <button onClick={removeMap} title="Delete map" className="grid h-7 w-7 place-items-center rounded-md" style={{ color: 'var(--ink-3)' }}><X size={13} weight="bold" /></button>
          </div>
          <p className="pointer-events-none absolute bottom-3 left-4 z-10 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Tab child · Enter sibling · double-click edit · Delete branch · Space fold · C colour · T to the board · drag a node anywhere, onto another to move it under it · drag the background to pan, wheel to zoom</p>

          <svg ref={svgRef} className={`h-full w-full select-none ${ghost ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}`} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}>
            <rect data-bg="1" width="100%" height="100%" fill="transparent" />
            <g transform={`translate(${view.x + (svgRef.current?.clientWidth || 900) / 2}, ${view.y + (svgRef.current?.clientHeight || 500) / 2}) scale(${view.k})`}>
              {Object.values(nodes).map(n => {
                if (!n.parent || !pos[n.id] || !pos[n.parent]) return null
                const a = pos[n.parent], b = pos[n.id]
                const x1 = a.dir === 0 ? (b.dir > 0 ? NODE_W / 2 : -NODE_W / 2) : (a.dir > 0 ? a.x + NODE_W : a.x)
                const y1 = a.y + NODE_H / 2
                const x2 = b.dir > 0 ? b.x : b.x + NODE_W
                const y2 = b.y + NODE_H / 2
                const mx = (x1 + x2) / 2
                const color = PALETTE[n.color || nodes[n.parent].color] || 'rgba(var(--ink-rgb),.25)'
                return <path key={'e' + n.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={1.5} opacity={.8} />
              })}
              {Object.values(nodes).map(n => {
                const p = pos[n.id]; if (!p) return null
                const isRoot = n.id === root
                const x = isRoot ? -NODE_W / 2 : p.x
                const color = n.color ? PALETTE[n.color] : null
                const on = active === n.id
                const kids = Object.values(nodes).filter(c => c.parent === n.id).length
                return (
                  <g key={n.id} transform={`translate(${x}, ${p.y})`} onMouseDown={e => onNodeDown(e, n.id)} onDoubleClick={e => { e.stopPropagation(); setEditing(n.id) }}
                     className={isRoot ? 'cursor-pointer' : 'cursor-grab'} opacity={ghost?.id === n.id || (ghost && isDescendant(n.id, ghost.id)) ? .35 : 1}>
                    <rect width={NODE_W} height={NODE_H} rx={isRoot ? 18 : 10}
                      fill={isRoot ? 'var(--ink)' : 'var(--row)'} stroke={ghost?.target?.id === n.id && ghost.target.mode === 'child' ? 'var(--accent)' : on ? 'var(--accent)' : color || 'var(--line-2)'}
                      strokeWidth={ghost?.target?.id === n.id && ghost.target.mode === 'child' ? 2.5 : on ? 2 : 1} strokeDasharray={ghost?.target?.id === n.id && ghost.target.mode === 'child' ? '4 3' : undefined} />
                    {ghost?.target?.id === n.id && ghost.target.mode !== 'child' && (
                      <rect x={-4} y={ghost.target.mode === 'before' ? -GAP_Y / 2 - 1.5 : NODE_H + GAP_Y / 2 - 1.5} width={NODE_W + 8} height={3} rx={1.5} fill="var(--accent)" />
                    )}
                    {color && !isRoot && <rect x={0} y={8} width={3} height={NODE_H - 16} rx={1.5} fill={color} />}
                    {n.taskId && !isRoot && <circle cx={NODE_W - 9} cy={9} r={3} fill="var(--accent)"><title>On the board</title></circle>}
                    {editing === n.id ? (
                      <foreignObject x={6} y={4} width={NODE_W - 12} height={NODE_H - 8}>
                        <input autoFocus defaultValue={n.text} onBlur={e => { setText(n.id, e.target.value); setEditing(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setText(n.id, e.target.value); setEditing(null); addSibling(n.id) } if (e.key === 'Tab') { e.preventDefault(); setText(n.id, e.target.value); setEditing(null); addChild(n.id) } if (e.key === 'Escape') { setText(n.id, e.target.value); setEditing(null) } }}
                          className="h-full w-full bg-transparent px-1 text-[13px] outline-none" style={{ color: isRoot ? 'var(--bg)' : 'var(--ink)', fontWeight: isRoot ? 600 : 400 }} />
                      </foreignObject>
                    ) : (
                      <text x={isRoot ? NODE_W / 2 : 12} y={NODE_H / 2 + 4.5} textAnchor={isRoot ? 'middle' : 'start'} fontSize={13} fontWeight={isRoot ? 600 : 400}
                        fill={isRoot ? 'var(--bg)' : n.text ? 'var(--ink)' : 'var(--ink-3)'} style={{ fontFamily: isRoot ? 'var(--font-display)' : 'inherit' }}>
                        {(n.text || 'New idea').length > 24 ? (n.text || 'New idea').slice(0, 23) + '…' : (n.text || 'New idea')}
                      </text>
                    )}
                    {kids > 0 && !isRoot && (
                      <g onMouseDown={e => { e.stopPropagation(); toggle(n.id) }} transform={`translate(${p.dir > 0 ? NODE_W - 2 : 2}, ${NODE_H / 2})`}>
                        <circle r={7} fill="var(--panel)" stroke="var(--line-2)" />
                        <text textAnchor="middle" y={3.5} fontSize={9} fill="var(--ink-3)">{n.collapsed ? kids : '–'}</text>
                      </g>
                    )}
                  </g>
                )
              })}
              {ghost && nodes[ghost.id] && (
                <g transform={`translate(${ghost.x - NODE_W / 2}, ${ghost.y - NODE_H / 2})`} pointerEvents="none">
                  <rect width={NODE_W} height={NODE_H} rx={10} fill="var(--row)" stroke="var(--accent)" strokeWidth={1.5} opacity={.9} />
                  <text x={12} y={NODE_H / 2 + 4.5} fontSize={13} fill="var(--ink)">{(nodes[ghost.id].text || 'New idea').slice(0, 23)}</text>
                </g>
              )}
            </g>
          </svg>
        </section>
      ) : (
        <section className="panel grid min-h-[320px] place-items-center p-8 text-center">
          <div>
            <h2 className="display text-[28px] font-semibold leading-none">A clean napkin.</h2>
            <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>One idea in the middle, branches on both sides. Tab makes a child, Enter a sibling. It lays itself out.</p>
            <button onClick={newMap} className="pill mt-5 px-4 py-2 text-[13.5px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Start one</button>
          </div>
        </section>
      )}
    </main>
  )
}
