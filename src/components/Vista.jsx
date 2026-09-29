import { useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import Photo from './Photo.jsx'
import AerialHero from './AerialHero.jsx'

/**
 * Photographic hero. The photograph follows the hour (dawn, day, dusk, night)
 * and drifts slower than the page, so the copy appears to float in front of it.
 * With the moving hero on (`aerials` is the collection), aerial film plays over the photograph, under the
 * same grade, grain and veil; until a clip is cached the photograph is all there is, as before.
 */
export default function Vista({ scene, aerials = null, children }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.04, 1.12])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const copyO = useTransform(scrollYProgress, [0, .55], [1, 0])
  // While a clip plays, the scene's tint steps back: the film keeps its own colour (roadmap 159).
  const [live, setLive] = useState(false)

  return (
    <header ref={ref} className="on-photo relative isolate h-[100svh] min-h-[560px] overflow-hidden">
      <Photo animated key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        style={{ y: imgY, scale: imgScale }}
        className="photo absolute inset-0 h-full w-full object-cover object-center will-change-transform" />
      {aerials && <AerialHero collection={aerials} onLive={setLive} style={{ y: imgY, scale: imgScale }} className="absolute inset-0 h-full w-full will-change-transform" />}
      <div aria-hidden="true" className="grade absolute inset-0" style={{ opacity: aerials && live ? 0 : 1, transition: 'opacity 1.5s ease' }} />
      <div aria-hidden="true" className="grain absolute inset-0" />
      {/* Over film, a soft falloff behind the greeting keeps the type calm on busy clips. The glass frost cannot be relied
          on there: Chromium does not blur some hardware-decoded video (H.264 level 5.1) behind backdrop-filter (roadmap 159). */}
      {aerials && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: live ? 1 : 0, transition: 'opacity 1.5s ease',
        background: 'radial-gradient(ellipse 75% 60% at 28% 80%, rgba(var(--veil), .72) 0%, rgba(var(--veil), .38) 45%, transparent 78%)' }} />}
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'linear-gradient(to top, var(--page-bg) 0%, rgba(var(--page-veil),.6) 9%, rgba(var(--page-veil),.16) 26%, rgba(var(--page-veil),.05) 100%)' }} />
      <motion.div style={{ y: copyY, opacity: copyO }} className="relative z-10 h-full">{children}</motion.div>
    </header>
  )
}
