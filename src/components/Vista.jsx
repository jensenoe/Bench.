import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import Photo from './Photo.jsx'

/**
 * Photographic hero. The photograph follows the hour (dawn, day, dusk, night)
 * and drifts slower than the page, so the copy appears to float in front of it.
 */
export default function Vista({ scene, children }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.04, 1.12])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const copyO = useTransform(scrollYProgress, [0, .55], [1, 0])

  return (
    <section ref={ref} className="on-photo relative isolate h-[100svh] min-h-[560px] overflow-hidden">
      <Photo animated key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        style={{ y: imgY, scale: imgScale }}
        className="photo absolute inset-0 h-full w-full object-cover object-center will-change-transform" />
      <div aria-hidden="true" className="grade absolute inset-0" />
      <div aria-hidden="true" className="grain absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'linear-gradient(to top, var(--page-bg) 0%, rgba(var(--page-veil),.6) 9%, rgba(var(--page-veil),.16) 26%, rgba(var(--page-veil),.05) 100%)' }} />
      <motion.div style={{ y: copyY, opacity: copyO }} className="relative z-10 h-full">{children}</motion.div>
    </section>
  )
}
