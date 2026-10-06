import { lazy, Suspense, useEffect, useState } from 'react'
import { PanelSkeleton } from './Skeleton.jsx'
import { getRaci } from '../api/raci.js'

// The RAIDD log and the RACI matrix load with their tab, not with every project page.
const RaiddLog = lazy(() => import('./Raidd.jsx'))
const RaciMatrix = lazy(() => import('./Raci.jsx'))
const KittingTab = lazy(() => import('./Kitting.jsx'))

const TABS = [['overview', 'Overview'], ['raidd', 'RAIDD log'], ['raci', 'RACI']]
const PLAN_TABS = [...TABS, ['kit', 'Rüsten']]   // kitting per machine number, plans only (roadmap 171)
const tabsFor = key => String(key).startsWith('plan:') ? PLAN_TABS : TABS
const btn = 'pill inline-flex min-h-[32px] items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium btn-ghost'

/** The tab in the address (…&t=raidd), so a link opens the same view; Overview when there is none. */
const tabFromHash = (tabs = TABS) => {
  const t = new URLSearchParams(location.hash.split('?')[1] || '').get('t')
  return tabs.some(([k]) => k === t) ? t : 'overview'
}
const setTabInHash = (t) => {
  const [route, query = ''] = location.hash.split('?')
  const p = new URLSearchParams(query)
  if (t === 'overview') p.delete('t'); else p.set('t', t)
  const q = p.toString()
  history.replaceState(null, '', `${route}${q ? `?${q}` : ''}`)
}

/**
 * One project, three views (roadmap 168, 169): what the page always showed, the RAIDD log, and the RACI matrix;
 * a plan adds Rüsten, the kit per machine number (roadmap 171).
 * `projectKey` is the I-code ("I-1050") or "plan:<id>". The owners offered in the RAIDD log are the people the
 * RACI matrix knows: those on it, then the ones it suggests from tasks and meetings.
 */
export default function ProjectTabs({ projectKey, children }) {
  const tabs = tabsFor(projectKey)
  const [tab, setTab] = useState(() => tabFromHash(tabs))
  const [people, setPeople] = useState([])
  const choose = (t) => { setTab(t); setTabInHash(t) }
  // a link to another tab of the same project (…&t=raci) changes the hash without remounting the page
  useEffect(() => {
    const follow = () => setTab(tabFromHash(tabsFor(projectKey)))
    addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [projectKey])
  useEffect(() => {
    if (tab !== 'raidd') return
    let on = true
    getRaci(projectKey).then(r => { if (on) setPeople([...new Set([...(r.matrix?.people || []), ...(r.suggestions || [])])]) }).catch(() => {})
    return () => { on = false }
  }, [tab, projectKey])
  return (
    <>
      <div role="tablist" aria-label="Project views" className="flex flex-wrap items-center gap-1">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`ptab-${k}`} aria-selected={tab === k} aria-controls={`ppanel-${k}`} onClick={() => choose(k)}
            onKeyDown={e => {
              const i = tabs.findIndex(([x]) => x === tab)
              const n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : null
              if (n === null) return
              e.preventDefault(); choose(tabs[n][0]); document.getElementById(`ptab-${tabs[n][0]}`)?.focus()
            }}
            tabIndex={tab === k ? 0 : -1}
            className={btn} style={tab === k ? { background: 'var(--wash-2)', color: 'var(--ink)' } : undefined}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`ppanel-${tab}`} aria-labelledby={`ptab-${tab}`} className="flex flex-col gap-4">
        {tab === 'overview' ? children : (
          <Suspense fallback={<PanelSkeleton />}>
            {tab === 'raidd' ? <RaiddLog projectKey={projectKey} people={people} /> : tab === 'kit' ? <KittingTab projectKey={projectKey} /> : <RaciMatrix projectKey={projectKey} />}
          </Suspense>
        )}
      </div>
    </>
  )
}
