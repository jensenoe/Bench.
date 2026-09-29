import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, animate, useReducedMotion } from 'motion/react'
import { CLIPS, pickClip, wanted, shuffle, videoUrl, posterUrl } from '../aerials.js'
import { getAerials, prefetchAerials } from '../api/aerials.js'

const EASE = [0.16, 1, 0.3, 1]
const FADE = 1.5            // seconds: the next clip starts this long before the current one ends and fades in over it
const POLL = 20_000         // how often the hero asks which clips are cached and queues the next downloads, while the window shows
const HAVE_FUTURE_DATA = 3  // the next clip can start without a stall
// The clips keep their own colour (roadmap 159): the photograph's muting filter and the scene's tint do not apply to
// them. A light cinematic lift instead, a touch more contrast and colour, and a soft vignette in the veil colour
// that deepens the corners so the copy keeps its ground. The vignette fades in with the first clip and out with it.
const FILM = { filter: 'contrast(1.08) saturate(1.1)' }
const VIGNETTE = { zIndex: 3, background: 'radial-gradient(ellipse 120% 100% at 50% 45%, transparent 55%, rgba(var(--veil), .42) 100%)' }

// Everything the video callbacks touch lives in one mutable object (`s`), so play, pause and the swap never
// wait on a render. These helpers work on it and sit at module scope.
const canPlay = (s) => s.visible && s.onScreen
// Every opacity change goes through motion, with explicit keyframes: motion caches the last value per element,
// and a bare style write behind its back would make the next fade-in start "already at 1" and do nothing.
const fadeIn = (v) => animate(v, { opacity: [0, 1] }, { duration: FADE, ease: EASE })
const hide = (v) => animate(v, { opacity: 0 }, { duration: 0 })
const readyOf = (s) => new Set([...s.ready].filter(id => !s.bad.has(id)))
/** Every clip once before any repeats; a pick from an exhausted round starts the next round. */
const nextClip = (s) => {
  const r = pickClip({ clips: CLIPS, collection: s.collection, ready: readyOf(s), last: s.ids[s.front], played: s.played })
  if (!r) return null
  if (!r.fresh) s.played = s.ids[s.front] ? [s.ids[s.front]] : []
  s.played.push(r.clip.id)
  return r.clip
}
function load(s, i, clip) {
  const v = s.vids[i]
  if (!v) return
  s.ids[i] = clip?.id ?? null
  v.muted = true
  if (!clip) { if (v.getAttribute('src')) { v.removeAttribute('src'); v.load() } return }
  v.src = videoUrl(clip.id)
  v.load()
}
/** Loads the next clip behind the one on screen; with nothing else cached, the one on screen loops. */
function prepare(s) {
  const back = 1 - s.front
  load(s, back, nextClip(s))
  if (s.vids[s.front]) s.vids[s.front].loop = !s.ids[back]
}
/** The first clip fades in over the photograph. */
function start(s) {
  if (s.started || !canPlay(s)) return
  const clip = nextClip(s)
  const v = s.vids[s.front]
  if (!clip || !v) return
  s.started = true
  load(s, s.front, clip)
  v.style.zIndex = '2'
  if (s.vids[1 - s.front]) s.vids[1 - s.front].style.zIndex = '1'
  v.play().then(() => { fadeIn(v); if (s.vig) fadeIn(s.vig); s.onLive?.(true) }).catch(() => { s.started = false })
  prepare(s)
}
/**
 * The incoming clip goes on top and fades in from its first frame; the outgoing one keeps playing at full
 * opacity underneath until it is covered, then stops and the two swap roles.
 */
function crossfade(s) {
  const f = s.front, cur = s.vids[f], nxt = s.vids[1 - f]
  if (s.fading || !cur || !nxt || !s.ids[1 - f]) return
  s.fading = true
  nxt.style.zIndex = '2'; cur.style.zIndex = '1'
  nxt.currentTime = 0
  nxt.play().catch(() => {})
  fadeIn(nxt).then(() => {
    cur.pause()
    hide(cur)
    s.front = 1 - f
    s.fading = false
    prepare(s)
  })
}
function onTime(s, i) {
  if (i !== s.front || s.fading) return
  const v = s.vids[i], back = 1 - i
  if (!v?.duration || !isFinite(v.duration)) return
  if (!s.ids[back]) {
    // Something new may have been cached since: load it behind; otherwise keep looping this one.
    const n = nextClip(s)
    if (n) { load(s, back, n); v.loop = false } else v.loop = true
    return
  }
  if (v.duration - v.currentTime <= FADE + 0.25) {
    // Not buffered in time: the current clip goes round once more and the fade comes at its next end.
    if (s.vids[back]?.readyState >= HAVE_FUTURE_DATA) crossfade(s)
    else v.loop = true
  }
}
function onEnded(s, i) {
  if (i !== s.front || s.fading) return
  if (s.ids[1 - i] && s.vids[1 - i]?.readyState >= HAVE_FUTURE_DATA) return crossfade(s)
  const v = s.vids[i]; v.currentTime = 0; v.play().catch(() => {})
}
function onError(s, i) {
  if (s.ids[i]) s.bad.add(s.ids[i])
  if (i !== s.front) return load(s, i, nextClip(s))
  if (s.fading) return
  // The clip on screen failed: the next one if it is ready, otherwise back to the photograph and try again.
  if (s.ids[1 - i] && s.vids[1 - i]?.readyState >= HAVE_FUTURE_DATA) return crossfade(s)
  hide(s.vids[i]); if (s.vig) hide(s.vig); s.onLive?.(false); s.ids[i] = null; s.started = false
  start(s)
}
/** Plays what should be playing and nothing else. */
function sync(s) {
  if (!s.started) return start(s)
  for (const i of [0, 1]) {
    const v = s.vids[i]
    if (!v?.getAttribute('src')) continue
    const onScreen = i === s.front || s.fading
    if (canPlay(s) && onScreen) v.play().catch(() => {}); else v.pause()
  }
}

/**
 * The moving hero (Themes 2.0): aerial film behind the greeting, like a standby screen. Two stacked videos:
 * the front one plays while the back one loads the next clip; about 1.5 s before the front clip ends the
 * back one starts and fades in over it (opacity only), then they swap roles. No black frame, no jump.
 *
 * Clips come in random order from the whole collection, whatever the hour, each once before any repeats; the
 * download queue follows a shuffled order so variety arrives fast (roadmap 159).
 * Only cached clips play (server/aerials.js serves them from /media/aerials). The photograph stays underneath
 * in Vista, so until a clip is cached, offline or not, the hero looks exactly as before. Paused while the
 * window is hidden or Home is scrolled past it; with reduced motion, a still from a cached clip instead.
 */
export default function AerialHero({ collection = 'all', onLive, style, className = '' }) {
  const box = useRef(null)
  const reduce = useReducedMotion()
  const [status, setStatus] = useState(null)
  const [still, setStill] = useState(null)
  const live = useRef({ vids: [null, null], vig: null, front: 0, ids: [null, null], fading: false, started: false, played: [], bad: new Set(), ready: new Set(), collection, visible: true, onScreen: true, onLive })
  // this session's download order: a different spread of places each start
  const order = useRef(null)
  if (!order.current) order.current = shuffle(CLIPS.map(c => c.id))
  useEffect(() => { live.current.onLive = onLive }, [onLive])
  const setVid = useCallback((i, n) => { live.current.vids[i] = n }, [])
  const setVig = useCallback((n) => { live.current.vig = n }, [])

  // The collection steers the next pick; the clip already loaded behind is swapped for one from it.
  useEffect(() => {
    const s = live.current
    const changed = s.collection !== collection
    s.collection = collection
    if (changed) s.played = []
    if (changed && s.started && !s.fading) prepare(s)
  }, [collection])

  // Which clips are cached; queue the next few of this session's order (the server fetches one at a time, so the
  // queue runs on between polls and the whole collection is cached within the first sessions).
  useEffect(() => {
    let on = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        let st = await getAerials()
        const ready = st.clips.filter(c => c.ready).map(c => c.id)
        const ids = wanted({ collection, ready, n: 6, order: order.current })
        if (ids.length && !st.busy && !st.queued) st = await prefetchAerials(ids)
        if (on) setStatus(st)
      } catch { /* offline, or the server is restarting: the photograph stays */ }
    }
    tick()
    const id = setInterval(tick, POLL)
    return () => { on = false; clearInterval(id) }
  }, [collection])

  // Cached clips reach the players; the first one starts as soon as there is one.
  useEffect(() => {
    if (!status) return
    const s = live.current
    s.ready = new Set(status.clips.filter(c => c.ready).map(c => c.id))
    if (reduce) {
      const posters = new Set(status.clips.filter(c => c.poster).map(c => c.id))
      setStill(pickClip({ clips: CLIPS, collection, ready: posters })?.clip.id ?? null)
      return
    }
    if (!s.started) start(s)
    else if (!s.fading && !s.ids[1 - s.front]) prepare(s)
  }, [status, reduce, collection])

  // A hidden window, or Home scrolled past the hero: nothing plays.
  useEffect(() => {
    if (reduce) return
    const s = live.current
    const onVis = () => { s.visible = document.visibilityState === 'visible'; sync(s) }
    const io = new IntersectionObserver(([e]) => { s.onScreen = e.isIntersecting; sync(s) }, { threshold: 0.02 })
    if (box.current) io.observe(box.current)
    document.addEventListener('visibilitychange', onVis)
    onVis()
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); s.vids.forEach(v => v?.pause()) }
  }, [reduce])

  const video = (i) => (
    <video ref={n => setVid(i, n)} muted playsInline preload="auto" disablePictureInPicture tabIndex={-1}
      onTimeUpdate={() => onTime(live.current, i)} onEnded={() => onEnded(live.current, i)} onError={() => onError(live.current, i)}
      style={FILM} className="absolute inset-0 h-full w-full object-cover object-center opacity-0" />
  )
  return (
    <motion.div ref={box} aria-hidden="true" style={style} className={`pointer-events-none ${className}`}>
      {reduce
        ? still && <>
            <motion.img key={still} src={posterUrl(still)} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: FADE, ease: EASE }}
              style={FILM} className="absolute inset-0 h-full w-full object-cover object-center" />
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: FADE, ease: EASE }} style={VIGNETTE} className="absolute inset-0" />
          </>
        : <>{video(0)}{video(1)}<div ref={setVig} style={VIGNETTE} className="absolute inset-0 opacity-0" /></>}
    </motion.div>
  )
}
