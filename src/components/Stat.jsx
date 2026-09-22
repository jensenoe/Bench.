import { useEffect, useRef } from 'react'
import { animate, useInView } from 'framer-motion'

/** A counter that rolls up to its value once, when it scrolls into view. */
export default function Stat({ value, label, accent, delay = 0 }) {
  const ref = useRef(null)
  const numRef = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!inView || !numRef.current) return
    const node = numRef.current
    const controls = animate(0, value, {
      duration: 0.9,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => { node.textContent = String(Math.round(v)) }
    })
    return () => controls.stop()
  }, [inView, value, delay])

  return (
    <div ref={ref} className="flex items-baseline gap-2.5">
      <span ref={numRef}
            className="tnum font-display text-[28px] leading-none sm:text-[34px]"
            style={{ color: accent, textShadow: '0 1px 12px rgb(20 17 12 / .55), 0 1px 2px rgb(20 17 12 / .5)' }}>0</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.13em] text-white/80"
            style={{ textShadow: '0 1px 6px rgb(20 17 12 / .6)' }}>{label}</span>
    </div>
  )
}
