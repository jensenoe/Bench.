/**
 * Skeletons shaped like what is coming, instead of the word "Loading" (roadmap 61). Blocks share the
 * shape lock: 20 px panels, 12 px rows, 4 px text bars. The shimmer stops under reduced motion.
 */
export const Bar = ({ w = '60%', h = 12, className = '' }) => <span aria-hidden="true" className={`skel block rounded-[4px] ${className}`} style={{ width: w, height: h }} />

/** A panel with a title bar and n row cards, the shape of a lane, a list or a table. */
export function PanelSkeleton({ rows = 4, title = true, className = '' }) {
  return (
    <section aria-hidden="true" className={`panel p-6 sm:p-7 ${className}`}>
      {title && <><Bar w="34%" h={22} /><Bar w="62%" h={12} className="mt-3" /></>}
      <div className={`${title ? 'mt-6' : ''} flex flex-col gap-2.5`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="row flex items-start gap-3 px-4 py-3">
            <span className="skel mt-[2px] block h-[18px] w-[18px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1"><Bar w={`${58 + ((i * 17) % 30)}%`} h={13} /><Bar w="38%" h={11} className="mt-2" /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Rows for the Hours ledger while the month loads. */
export function LedgerSkeleton({ rows = 10 }) {
  return (
    <div aria-hidden="true" className="ledger">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-6 py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
          <Bar w={90} h={12} /><Bar w={44} h={12} /><Bar w={44} h={12} /><Bar w={36} h={12} /><Bar w={52} h={12} className="ml-auto" />
        </div>
      ))}
    </div>
  )
}

/** A whole work page before its chunk or its data arrives: the header's height, then one panel. */
export default function PageSkeleton({ message }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="relative h-[58vh] min-h-[460px] max-h-[760px]" style={{ background: 'linear-gradient(to bottom, var(--bg-2), var(--bg))', marginBottom: -120 }}>
        <div className="mx-auto flex h-full col flex-col justify-end px-6" style={{ paddingBottom: 148 }}>
          <div className="panel w-[min(560px,100%)] px-7 py-5" style={{ background: 'var(--panel)' }}>
            <Bar w={200} h={38} /><Bar w="70%" h={12} className="mt-4" />
          </div>
        </div>
      </div>
      <main className="mx-auto col px-6">
        <PanelSkeleton rows={5} />
        {message && <p role="status" className="mt-6 text-[13.5px]" style={{ color: 'var(--late)' }}>{message}</p>}
      </main>
    </div>
  )
}
