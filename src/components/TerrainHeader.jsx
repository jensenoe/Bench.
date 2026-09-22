/** Page header: a terrain render with the title set into it. Work pages take the compact one. */
import Photo from './Photo.jsx'

export default function TerrainHeader({ scene, title, line, aside, compact = false }) {
  return (
    <header className={`on-photo relative isolate overflow-hidden ${compact ? 'h-[34vh] min-h-[250px] max-h-[360px]' : 'h-[52vh] min-h-[380px]'}`}>
      <Photo key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
        className="photo absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, rgba(var(--veil),.35) 0%, rgba(var(--veil),.1) 45%, var(--page-bg) 100%)' }} />
      <div className={`relative z-10 mx-auto flex h-full col flex-col justify-end px-6 ${compact ? 'pb-6' : 'pb-10'}`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className={`glass ${compact ? 'px-6 py-4' : 'px-7 py-6'}`}>
            <h1 className={`display font-semibold leading-none ${compact ? 'text-[32px] sm:text-[40px]' : 'text-[40px] sm:text-[56px]'}`}
              style={{ textShadow: 'var(--shadow-text)' }}>{title}.</h1>
            {line && <p className={`max-w-[48ch] leading-relaxed ${compact ? 'mt-2 text-[13.5px]' : 'mt-3 text-[14.5px]'}`} style={{ color: 'var(--ink-2)' }}>{line}</p>}
          </div>
          {aside}
        </div>
      </div>
    </header>
  )
}
