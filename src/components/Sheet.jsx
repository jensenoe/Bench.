/**
 * The sheet itself: ruled border with grid references down the left
 * and across the top, the way a drawing sheet is zoned. The references
 * are not decoration — they are how you say "the bit at C3".
 */
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F']

export function SheetFrame({ children }) {
  return (
    <div className="relative mx-auto min-h-screen max-w-[1240px] px-7 sm:px-11">
      {/* left margin references */}
      <div aria-hidden="true"
           className="pointer-events-none absolute inset-y-0 left-0 hidden w-7 flex-col justify-around sm:flex">
        {ROWS.map(r => <span key={r} className="gridref text-center">{r}</span>)}
      </div>
      <div className="rule-l rule-r min-h-screen" style={{ borderColor: 'var(--rule)' }}>
        {children}
      </div>
    </div>
  )
}

/** Bottom-right title block — the drawing's identity card. */
export function TitleBlock({ fields }) {
  return (
    <div className="rule-t mt-12 grid grid-cols-2 sm:grid-cols-4"
         style={{ borderColor: 'var(--rule-strong)' }}>
      {fields.map((f, i) => (
        <div key={f.label}
             className={`px-3 py-2.5 ${i > 0 ? 'rule-l' : ''}`}
             style={{ borderColor: 'var(--rule)' }}>
          <div className="anno">{f.label}</div>
          <div className="num mt-1 text-[12px]" style={{ color: f.tone || 'var(--ink-soft)' }}>
            {f.value}
          </div>
        </div>
      ))}
    </div>
  )
}
