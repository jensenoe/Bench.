import { ArrowSquareOut } from '@phosphor-icons/react'
import { ABOUT, SHEETS } from '../copy.js'
import { libraryLabel, nextChange } from '../scenes.js'
import { openTool } from '../api.js'

const Col = ({ title, children }) => (
  <div>
    <div className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>{title}</div>
    <ul className="mt-3 flex flex-col gap-2 text-[13px]">{children}</ul>
  </div>
)

/**
 * The footer is the last thing on every page, so it gets the same care as the first:
 * a large wordmark and one honest sentence on the left, a small directory on the right,
 * the scene's glow bleeding in from above, and the first name set very large and very faint,
 * clipped inside the column so it reads as a mark rather than a mistake.
 */
export default function Footer({ name, version, scene, glow, now = new Date(), onSettings }) {
  const first = (name || '').split(/\s+/)[0] || 'Bench'
  const nx = nextChange(now), nextHour = `${String(nx.getHours() % 24).padStart(2, '0')}:${String(nx.getMinutes()).padStart(2, '0')}`
  const pages = SHEETS.filter(s => !s.external)
  const tools = [
    { label: 'Cockpit', url: 'https://cockpit.tom.fit/dashboard' },
    { label: 'Issue tickets', url: 'https://issues.tom.fit/' },
    { label: 'QMS', url: 'https://tf-hw-qms.vercel.app/' },
    { label: 'Structured BOM', url: 'https://oetwil-structured-bom.vercel.app/' }
  ]
  return (
    <footer className="relative mt-32 overflow-hidden" style={{ borderTop: '1px solid var(--line)' }}>
      {/* the scene's light, faint, from the seam */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
           style={{ background: `radial-gradient(60% 100% at 30% 0%, ${glow || scene?.glow || 'var(--glow)'} 0%, transparent 70%)`, opacity: .6 }} />
      {/* the mark: aligned to the column's right edge, sunk into the bottom, barely there */}
      <div aria-hidden="true" className="display pointer-events-none absolute -bottom-[0.24em] select-none whitespace-nowrap font-semibold leading-none"
           style={{ right: 'max(24px, calc((100% - var(--col)) / 2 + 24px))', color: 'rgba(var(--ink-rgb),.05)', fontSize: 'clamp(120px, 17vw, 260px)', letterSpacing: '-0.04em' }}>{first}</div>
      <div className="relative mx-auto col px-6">

        <div className="relative grid gap-12 pb-28 pt-20 md:grid-cols-12">
          <div className="md:col-span-6">
            <p className="display text-[40px] font-semibold leading-none tracking-tight sm:text-[48px]">Bench<span style={{ color: 'var(--accent)' }}>.</span></p>
            <p className="display mt-6 max-w-[22ch] text-[22px] font-light leading-snug tracking-tight sm:text-[26px]" style={{ color: 'var(--ink-2)' }}>{ABOUT.short}</p>
            <p className="mt-6 max-w-[46ch] text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{ABOUT.footer}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-6 md:pt-3">
            <Col title="Pages">
              <li><a href="#/" className="hover:underline underline-offset-2">Home</a></li>
              {pages.map(s => <li key={s.id}><a href={`#/${s.id}`} className="hover:underline underline-offset-2">{s.title}</a></li>)}
              <li><button onClick={onSettings} className="hover:underline underline-offset-2" style={{ color: 'var(--ink-2)' }}>Settings</button></li>
            </Col>
            <Col title="Tools">
              {tools.map(t => <li key={t.label}><a href={t.url} onClick={e => { e.preventDefault(); openTool(t.url) }} className="inline-flex items-center gap-1 hover:underline underline-offset-2">{t.label} <ArrowSquareOut size={11} /></a></li>)}
            </Col>
            <Col title="Right now">
              <li style={{ color: 'var(--ink-2)' }}>{scene?.label || 'Day'} light</li>
              <li style={{ color: 'var(--ink-2)' }}>{libraryLabel(scene?.library)}</li>
              <li style={{ color: 'var(--ink-3)' }}>Next picture at <span className="tnum">{nextHour}</span></li>
              <li style={{ color: 'var(--ink-3)' }}>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</li>
            </Col>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3 py-6 text-[12px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
          <span>Made at TomFit by Noël, for his own bench first.</span>
          <span className="tnum">Photographs from Pexels and Unsplash{version ? ` · v${String(version).replace(/-beta\.(\d+)/, ' beta $1')}` : ''}</span>
        </div>
      </div>
    </footer>
  )
}
