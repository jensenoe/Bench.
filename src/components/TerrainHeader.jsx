/** Dashboard header: a terrain render with the title set into it. */
import Photo from './Photo.jsx'

export default function TerrainHeader({ scene, title, line, aside }) {
  return (
    <header className="on-photo relative isolate h-[52vh] min-h-[380px] overflow-hidden">
      <Photo key={scene.terrain} src={scene.terrain} fallback={scene.fallback}
           className="photo absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, rgba(var(--veil),.35) 0%, rgba(var(--veil),.1) 45%, var(--page-bg) 100%)' }} />
      <div className="relative z-10 mx-auto flex h-full col flex-col justify-end px-6 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="glass px-7 py-6">
            <h1 className="display text-[40px] font-semibold leading-none sm:text-[56px]"
                style={{ textShadow: 'var(--shadow-text)' }}>{title}.</h1>
            <p className="mt-3 max-w-[48ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{line}</p>
          </div>
          {aside}
        </div>
      </div>
    </header>
  )
}
