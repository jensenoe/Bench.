import catalogue from './aerials.json'

/**
 * The moving hero's clips (Themes 2.0). The catalogue is src/aerials.json; the files come through
 * server/aerials.js, which downloads them on demand and serves them from /media/aerials, so the page's
 * Content Security Policy ('self' only) holds. These helpers are pure: the hero and the tests share them.
 */
export const SCENES = ['dawn', 'day', 'dusk', 'night']

/**
 * When a scene has no clip ready, the hero borrows from the scenes beside it in the day, nearest first:
 * a dawn with nothing cached shows day, then night, before it shows dusk.
 */
export const NEAR = {
  dawn: ['dawn', 'day', 'night', 'dusk'],
  day: ['day', 'dawn', 'dusk', 'night'],
  dusk: ['dusk', 'night', 'day', 'dawn'],
  night: ['night', 'dusk', 'dawn', 'day']
}

/** Every clip, flat, with the collection it belongs to. */
export const flatten = (cat = catalogue) => (cat.collections || []).flatMap(c => (c.clips || []).map(x => ({ ...x, collection: c.key })))
export const CLIPS = flatten()
export const AERIAL_COLLECTIONS = (catalogue.collections || []).map(c => ({ key: c.key, label: c.label }))

export const videoUrl = (id) => `/media/aerials/${id}.mp4`
export const posterUrl = (id) => `/media/aerials/${id}.jpg`

const inCollection = (collection) => (c) => !collection || collection === 'all' || c.collection === collection

/**
 * The next clip to show: from the chosen collection, cached (`ready` holds the ids), in the current scene or
 * the nearest scene that has one, never the clip just shown (`last`). `recent` (older ids) is avoided when
 * there is a choice, so a long evening does not ping-pong between two clips. Null when nothing else is ready.
 */
export function pickClip({ clips = CLIPS, scene = 'day', collection = 'all', ready, last = null, recent = [], random = Math.random } = {}) {
  const has = ready instanceof Set ? (id) => ready.has(id) : Array.isArray(ready) ? (id) => ready.includes(id) : () => true
  const pool = clips.filter(inCollection(collection)).filter(c => has(c.id) && c.id !== last)
  for (const s of NEAR[scene] || NEAR.day) {
    const here = pool.filter(c => c.scene === s)
    if (!here.length) continue
    const fresh = here.filter(c => !recent.includes(c.id))
    const from = fresh.length ? fresh : here
    return from[Math.min(from.length - 1, Math.floor(random() * from.length))]
  }
  return null
}

/**
 * What to download next: clips of this scene in the collection that are not cached yet, then the nearest
 * scenes, `n` at most. The server takes the list as a request and checks every id against the catalogue.
 */
export function wanted({ clips = CLIPS, scene = 'day', collection = 'all', ready = [], n = 3 } = {}) {
  const has = new Set(ready)
  const out = []
  for (const s of NEAR[scene] || NEAR.day) {
    for (const c of clips.filter(inCollection(collection))) if (c.scene === s && !has.has(c.id) && !out.includes(c.id)) out.push(c.id)
    if (out.length >= n) break
  }
  return out.slice(0, n)
}

/** Who filmed the clips, for Settings. */
export const aerialCredits = (clips = CLIPS) => [...new Set(clips.map(c => c.by).filter(Boolean))]
