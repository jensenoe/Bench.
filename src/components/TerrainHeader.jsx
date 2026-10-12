/**
 * Page header for the work pages: a slim band of the scene's photograph behind the nav and the title
 * (roadmap 173). The picture, the grade and the grain stay, so the room keeps its light; the band is about
 * 160 px, so the work starts right under it, above the fold. Home keeps its full hero (Vista.jsx).
 * `compact` is accepted for older callers and changes nothing: every work page has the slim band.
 */
import Photo from './Photo.jsx'

const FADE = 'linear-gradient(to bottom, black 0%, black 78%, transparent 100%)'

export default function TerrainHeader({ scene, title, line, aside }) {
  return (
    <header className="on-photo relative isolate overflow-hidden">
      {/* The picture fades out at the seam instead of meeting the page in a line, so the page's own glow takes over. */}
      <div aria-hidden="true" className="absolute inset-0" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
        <Photo key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
          className="photo absolute inset-0 h-full w-full object-cover object-[50%_42%]" />
        <div className="grade absolute inset-0" />
        <div className="grain absolute inset-0" />
        {/* the night veil: strongest at the top, where the nav reads on it in both themes */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(var(--veil),.46) 0%, rgba(var(--veil),.12) 50%, rgba(var(--veil),.2) 100%)' }} />
      </div>
      <div className="relative z-10 mx-auto col px-6 pb-4 pt-[88px] 2xl:pt-[92px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="glass flex min-w-0 max-w-full flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
            <h1 className="display text-[28px] font-semibold leading-none sm:text-[32px]" style={{ textShadow: 'var(--shadow-text)' }}>{title}.</h1>
            {line && <p className="min-w-0 max-w-[76ch] text-[13.5px] leading-snug" style={{ color: 'var(--ink-2)' }}>{line}</p>}
          </div>
          {aside}
        </div>
      </div>
    </header>
  )
}
