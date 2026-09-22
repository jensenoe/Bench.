import { Component } from 'react'

/**
 * The last line of defence. When a render throws, React would otherwise unmount everything and
 * leave a dark, empty window. This catches it, writes the stack to bench.log through Electron,
 * and shows a small panel with the message and two ways out: reload, or go home and reload.
 */
export default class Fault extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    this.setState({ info })
    const line = `render crash at ${location.hash || '#/'}: ${error?.message}\n${error?.stack || ''}\n${info?.componentStack || ''}`
    try { window.bench?.log?.(line) } catch { /* ignore */ }
    console.error(line)
  }
  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    const details = `${error.message}\n\n${error.stack || ''}\n${info?.componentStack || ''}`
    return (
      <div className="grid min-h-screen place-items-center px-6" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <div className="panel w-full max-w-[560px] px-7 py-6">
          <p className="display text-[15px] font-semibold tracking-tight" style={{ color: 'var(--ink-3)' }}>Bench.</p>
          <h1 className="display mt-2 text-[34px] font-semibold leading-none tracking-tight">Something broke.</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            The page hit an error while drawing itself. Nothing on the board or in the time clock is lost; both live on disk. The details are in bench.log, and below.
          </p>
          <pre className="tnum mt-4 max-h-[180px] overflow-auto rounded-[10px] p-3 text-[11px] leading-relaxed" style={{ background: 'rgba(var(--ink-rgb),.06)', color: 'var(--ink-3)', whiteSpace: 'pre-wrap' }}>{details.trim()}</pre>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => location.reload()} className="pill px-5 py-2.5 text-[13px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Reload</button>
            <button onClick={() => { location.hash = '#/'; location.reload() }} className="pill px-5 py-2.5 text-[13px]" style={{ border: '1px solid var(--line-2)' }}>Home and reload</button>
            <button onClick={() => { try { navigator.clipboard.writeText(details) } catch { /* ignore */ } }} className="text-[12.5px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Copy details</button>
            {window.bench?.openLog && <button onClick={() => window.bench.openLog()} className="text-[12.5px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>Open the log</button>}
          </div>
        </div>
      </div>
    )
  }
}
