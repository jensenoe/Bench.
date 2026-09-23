/**
 * Page header: a terrain render with the title set into it.
 * Work pages take the compact one: still tall, and the page content starts on top of the picture's
 * lower part (negative bottom margin), so the photograph is not cut off by a fade but covered by
 * the first panel, the way the doors sit on the Home page.
 */
import Photo from './Photo.jsx'

export const OVERLAP = 120   // px of photograph the first panel sits on

export default function TerrainHeader({ scene, title, line, aside, compact = false }) {
  return (
    <header className={`on-photo relative isolate overflow-hidden ${compact ? 'h-[58vh] min-h-[460px] max-h-[760px]' : 'h-[52vh] min-h-[380px]'}`}
      style={compact ? { marginBottom: -OVERLAP } : undefined}>
      <Photo key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        className="photo absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden="true" className="grade absolute inset-0" />
      <div aria-hidden="true" className="grain absolute inset-0" />
      {/* A light veil over most of the picture; the page colour only arrives at the very bottom, where the content already covers it. */}
      <div className="absolute inset-0" style={{
        background: compact
          // top stops use the night veil (the nav reads on it in both themes); the bottom ones use the page's own colour,
          // so a light page gets a light fade instead of a dark band turning cream at the last moment
          ? 'linear-gradient(to bottom, rgba(var(--veil),.28) 0%, rgba(var(--veil),.06) 30%, rgba(var(--page-veil),.1) 55%, rgba(var(--page-veil),.4) 78%, rgba(var(--page-veil),.8) 92%, var(--page-bg) 100%)'
          : 'linear-gradient(to bottom, rgba(var(--veil),.35) 0%, rgba(var(--veil),.1) 45%, var(--page-bg) 100%)' }} />
      <div className="relative z-10 mx-auto flex h-full col flex-col justify-end px-6" style={{ paddingBottom: compact ? OVERLAP + 28 : 40 }}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className={`glass ${compact ? 'px-7 py-5' : 'px-7 py-6'}`}>
            <h1 className={`display font-semibold leading-none ${compact ? 'text-[36px] sm:text-[46px]' : 'text-[40px] sm:text-[56px]'}`}
              style={{ textShadow: 'var(--shadow-text)' }}>{title}.</h1>
            {line && <p className={`max-w-[48ch] leading-relaxed ${compact ? 'mt-2.5 text-[14px]' : 'mt-3 text-[14.5px]'}`} style={{ color: 'var(--ink-2)' }}>{line}</p>}
          </div>
          {aside}
        </div>
      </div>
    </header>
  )
}
