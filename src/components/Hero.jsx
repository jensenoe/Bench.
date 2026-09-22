import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Stat from './Stat.jsx'

const EASE = [0.16, 1, 0.3, 1]

export default function Hero({ stats, children }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  // Photo drifts slower than the page; copy drifts faster and fades out.
  const imgY     = useTransform(scrollYProgress, [0, 1], ['0%', '22%'])
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.06, 1.16])
  const copyY    = useTransform(scrollYProgress, [0, 1], [0, -70])
  const copyFade = useTransform(scrollYProgress, [0, 0.65], [1, 0])
  const farY     = useTransform(scrollYProgress, [0, 1], [0, -26])
  const nearY    = useTransform(scrollYProgress, [0, 1], [0, -10])

  const today = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header ref={ref} className="relative isolate h-[74vh] min-h-[440px] overflow-hidden">
      <motion.img
        src="/ridge.jpg" alt="" aria-hidden="true"
        style={{ y: imgY, scale: imgScale, objectPosition: '50% 58%' }}
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
      />
      <div className="absolute inset-0 hero-scrim" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[62%]" style={{
        background: "linear-gradient(to top, rgb(20 17 12 / .62) 0%, rgb(20 17 12 / .34) 42%, transparent 100%)" }} />
      <div className="pointer-events-none absolute inset-0 grain" />

      {/* Ridges rising out of the page background — depth at the seam */}
      <motion.div aria-hidden="true" style={{ y: farY }}
        className="absolute inset-x-0 bottom-[38px] h-[110px] will-change-transform"
        // eslint-disable-next-line
        {...{ }}
      >
        <div className="h-full w-full" style={{
          background: 'var(--bg-deep)',
          WebkitMaskImage: 'url(/ridge-far.svg)', maskImage: 'url(/ridge-far.svg)',
          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat'
        }} />
      </motion.div>
      <motion.div aria-hidden="true" style={{ y: nearY }}
        className="absolute inset-x-0 -bottom-px h-[104px] will-change-transform">
        <div className="h-full w-full" style={{
          background: 'var(--bg)',
          WebkitMaskImage: 'url(/ridge-near.svg)', maskImage: 'url(/ridge-near.svg)',
          WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat'
        }} />
      </motion.div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        {children}
      </div>

      <motion.div style={{ y: copyY, opacity: copyFade }}
        className="relative z-10 mx-auto flex h-full max-w-[1180px] flex-col justify-end px-4 pb-[150px] sm:px-6">
        <motion.p
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .7, ease: EASE }}
          className="mb-3 text-[11px] uppercase tracking-[0.3em] text-white/60">
          {today}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .85, delay: .07, ease: EASE }}
          className="font-display text-[54px] leading-[0.92] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,.35)] sm:text-[76px]">
          Ridgeline
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .8, delay: .16, ease: EASE }}
          className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-white/75">
          Five lanes, one hard cap, and the lead times that decide whether a build slips.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .8, delay: .26, ease: EASE }}
          className="mt-8 flex flex-wrap items-center gap-x-9 gap-y-4">
          <Stat value={stats.open}  label="Open"    accent="#fff"                    delay={.35} />
          <Stat value={stats.today} label="Today"   accent="var(--color-alpenglow-lit)"  delay={.45} />
          <Stat value={stats.waiting} label="Waiting" accent="var(--color-ice-lit)"      delay={.55} />
          <Stat value={stats.innovation} label="Innovation" accent="var(--color-lichen-lit)" delay={.65} />
        </motion.div>
      </motion.div>
    </header>
  )
}
