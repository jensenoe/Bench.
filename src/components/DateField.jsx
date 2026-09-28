import { useRef } from 'react'
import { CalendarBlank, X } from '@phosphor-icons/react'
import { shortDate } from '../lanes.js'

/**
 * A date the way the app writes dates ("Tue 22 Sep"), with the system picker behind it.
 * value and onChange speak ISO (yyyy-mm-dd or ''); the native input is there only for the calendar.
 */
export default function DateField({ value, onChange, placeholder = 'Pick a day', className = '', clearable = true, autoFocus = false }) {
  const native = useRef(null)
  const open = () => { const el = native.current; if (!el) return; try { el.showPicker() } catch { el.focus(); el.click() } }
  const label = value ? shortDate(new Date(value.slice(0, 10) + 'T12:00:00')) : null
  return (
    <span className={`relative flex items-stretch ${className}`}>
      <button type="button" onClick={open} autoFocus={autoFocus} className={`field flex flex-1 items-center gap-2 py-1.5 pl-2.5 text-left text-[13px] ${clearable && value ? 'pr-9' : 'pr-2.5'}`} style={{ color: label ? 'var(--ink)' : 'var(--ink-3)' }}>
        <CalendarBlank size={13} weight="bold" style={{ color: 'var(--ink-3)' }} />
        <span className="tnum flex-1 truncate">{label || placeholder}</span>
      </button>
      {clearable && value && <button type="button" aria-label="Clear date" onClick={() => onChange('')}
        className="absolute right-1 top-1/2 z-[1] grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[4px] hover:bg-[var(--wash)]" style={{ color: 'var(--ink-3)' }}><X size={11} weight="bold" /></button>}
      <input ref={native} type="date" tabIndex={-1} aria-hidden="true" value={value || ''} onChange={e => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
    </span>
  )
}
