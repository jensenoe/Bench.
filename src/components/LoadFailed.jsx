/**
 * What a page or a panel shows when its data did not come back: instead of a skeleton that never ends,
 * or an empty state that says there is nothing when there may be plenty. One headline with a period,
 * one sentence with what happened and what to do, and Try again. Read out as an alert.
 */
export default function LoadFailed({ title, message, onRetry }) {
  return (
    <section role="alert" className="panel p-6 sm:p-7">
      <h2 className="display text-[22px] font-semibold leading-none">{title}</h2>
      <p className="mt-3 max-w-[65ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="pill btn-quiet mt-5 px-4 py-2 text-[13.5px] font-medium">Try again</button>}
    </section>
  )
}
