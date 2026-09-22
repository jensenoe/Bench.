/**
 * Whose work: mine (no lead, or a lead that is me), everyone, or one named person.
 * Only appears once tasks carry other people's names, so a one-person board never sees it.
 */
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Does a lead field name the signed-in person? Full name, surname, or first name plus initial. */
export function isMine(lead, name) {
  if (!lead) return true
  const l = strip(lead), parts = strip(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return false
  if (l === parts.join(' ') || l === parts[0]) return true
  const last = parts.length > 1 ? parts.at(-1) : null
  if (last && last.length >= 3 && l.includes(last)) return true
  return false
}

export default function PeopleFilter({ tasks, value, onChange, name }) {
  const open = tasks.filter(t => !t.done)
  const others = [...new Set(open.map(t => t.lead).filter(Boolean).filter(l => !isMine(l, name)))].sort()
  if (!others.length && value === 'mine') return null
  if (!others.length) return null
  const count = k => k === 'everyone' ? open.length : k === 'mine' ? open.filter(t => isMine(t.lead, name)).length : open.filter(t => t.lead === k).length
  const keys = ['mine', 'everyone', ...others]
  const label = k => k === 'mine' ? 'Mine' : k === 'everyone' ? 'Everyone' : k
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13.5px]" style={{ color: 'var(--ink-3)' }}>Whose</span>
      {keys.map(k => {
        const on = value === k
        return (
          <button key={k} onClick={() => onChange(k)} className="pill flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors"
            style={{ color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'rgba(var(--ink-rgb),.1)' : 'transparent', border: '1px solid var(--line)' }}>
            {label(k)}<span className="tnum" style={{ color: on ? 'var(--ink-2)' : 'var(--ink-3)', opacity: .8 }}>{count(k)}</span>
          </button>
        )
      })}
    </div>
  )
}
