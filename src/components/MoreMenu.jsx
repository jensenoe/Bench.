import { useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CaretDown, ArrowSquareOut } from '@phosphor-icons/react'
import { GROUPS, MORE, TOMFIT } from '../pages.js'
import { openTool } from '../api.js'

/**
 * The More menu in the nav (roadmap 130). A disclosure, not an ARIA menu: a button that opens a panel of
 * plain links, grouped, each with the line that says what the page is for. When the page on screen lives
 * in here, the button carries its name, so the nav always says where you are.
 *
 * Opens on click. Arrow keys walk the links, Home and End jump, Escape closes and gives focus back to the
 * button, a click outside or a route change closes it. Rendered only while open, so nothing hidden sits
 * in the page for a screen reader or a test to trip over.
 */
export default function MoreMenu({ route }) {
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const panel = useRef(null)
  const id = useId()
  const current = MORE.find(p => p.id === route)

  useEffect(() => { setOpen(false) }, [route])
  useEffect(() => {
    if (!open) return
    const links = () => [...(panel.current?.querySelectorAll('a') || [])]
    const t = setTimeout(() => (links().find(a => a.getAttribute('aria-current') === 'page') || links()[0])?.focus(), 20)
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); return }
      const all = links(); const i = all.indexOf(document.activeElement)
      if (i < 0) return
      const go = n => { e.preventDefault(); all[(n + all.length) % all.length]?.focus() }
      if (e.key === 'ArrowDown') go(i + 1)
      else if (e.key === 'ArrowUp') go(i - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(all.length - 1)
      else if (e.key === 'Tab' && ((!e.shiftKey && i === all.length - 1) || (e.shiftKey && i === 0))) setOpen(false)
    }
    const onDown = e => { if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false) }
    addEventListener('keydown', onKey, true); addEventListener('pointerdown', onDown, true)
    return () => { clearTimeout(t); removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', onDown, true) }
  }, [open])

  return (
    <div className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}
        className="-my-[3px] inline-flex items-center gap-1.5 py-[3px] text-[14px] transition-colors xl:text-[15px] 2xl:text-[16.5px]"
        style={{ color: current || open ? 'var(--ink)' : 'var(--ink-3)' }}>
        {current ? current.title : 'More'}
        <CaretDown size={12} weight="bold" className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div ref={panel} id={id} key="more"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}
            className="panel off-photo absolute left-[-20px] top-[calc(100%+18px)] z-[60] w-[min(560px,calc(100vw-48px))] p-5"
            style={{ boxShadow: 'var(--shadow-pop)', borderColor: 'var(--line-2)' }}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {GROUPS.map(g => (
                <section key={g.title} aria-label={g.title}>
                  <h2 className="px-3 text-[12.5px] font-medium" style={{ color: 'var(--ink-3)' }}>{g.title}</h2>
                  <ul className="mt-1.5 flex flex-col">
                    {g.pages.map(p => (
                      <li key={p.id}>
                        <a href={`#/${p.id}`} aria-current={route === p.id ? 'page' : undefined} onClick={() => setOpen(false)}
                          className="group flex items-baseline justify-between gap-3 rounded-[10px] px-3 py-2 transition-colors hover:bg-[var(--wash)] focus-visible:bg-[var(--wash)]"
                          style={route === p.id ? { background: 'var(--wash-2)' } : undefined}>
                          <span className="min-w-0">
                            <span className="block text-[14.5px] font-medium" style={{ color: 'var(--ink)' }}>{p.title}</span>
                            <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: 'var(--ink-3)' }}>{p.line}</span>
                          </span>
                          {p.key && <kbd className="tnum shrink-0 rounded-[4px] px-1.5 text-[12px]" style={{ color: 'var(--ink-3)' }} aria-label={`key ${p.key}`}>{p.key}</kbd>}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <section aria-label="TomFit tools">
                <h2 className="px-3 text-[12.5px] font-medium" style={{ color: 'var(--ink-3)' }}>TomFit tools</h2>
                <ul className="mt-1.5 flex flex-col">
                  {TOMFIT.map(t => (
                    <li key={t.label}>
                      <a href={t.url} onClick={e => { e.preventDefault(); setOpen(false); openTool(t.url) }}
                        className="flex min-h-[32px] items-center justify-between gap-3 rounded-[10px] px-3 py-1.5 text-[13.5px] transition-colors hover:bg-[var(--wash)] focus-visible:bg-[var(--wash)]"
                        style={{ color: 'var(--ink-2)' }}>
                        {t.label}<ArrowSquareOut size={12} weight="bold" aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
