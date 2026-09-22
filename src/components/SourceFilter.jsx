/** One row of chips above the lanes: which tool's work you are looking at. Counts are open items. */
const LABEL = { all: 'Everything', local: 'Added here', planner: 'Phase Gate', issues: 'Issues', qms: 'QMS', bom: 'BOM' }

export default function SourceFilter({ tasks, value, onChange }) {
  const open = tasks.filter(t => !t.done)
  const count = k => k === 'all' ? open.length : k === 'local' ? open.filter(t => !t.source || t.source === 'local').length : open.filter(t => t.source === k).length
  const keys = ['all', 'local', 'planner', 'issues', 'qms', 'bom'].filter(k => k === 'all' || count(k) > 0 || k === value)
  if (keys.length <= 2) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {keys.map(k => {
        const on = value === k
        return (
          <button key={k} onClick={() => onChange(k)} className="pill flex items-center gap-1.5 px-3 py-1.5 text-[13.5px] transition-colors"
            style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: '1px solid var(--line)' }}>
            {LABEL[k]}<span className="tnum" style={{ color: on ? 'var(--ink-2)' : 'var(--ink-3)', opacity: .8 }}>{count(k)}</span>
          </button>
        )
      })}
    </div>
  )
}
