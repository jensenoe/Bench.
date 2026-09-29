import catalogue from './aerials.json'

/**
 * The moving hero's clips (Themes 2.0). The catalogue is src/aerials.json; the files come through
 * server/aerials.js, which downloads them on demand and serves them from /media/aerials, so the page's
 * Content Security Policy ('self' only) holds. These helpers are pure: the hero and the tests share them.
 */
/** The catalogue still tags each clip with the light it was shot in; the hero no longer filters by it (roadmap 159). */
export const SCENES = ['dawn', 'day', 'dusk', 'night']

/** Every clip, flat, with the collection it belongs to. */
export const flatten = (cat = catalogue) => (cat.collections || []).flatMap(c => (c.clips || []).map(x => ({ ...x, collection: c.key })))
export const CLIPS = flatten()
export const AERIAL_COLLECTIONS = (catalogue.collections || []).map(c => ({ key: c.key, label: c.label }))

export const videoUrl = (id) => `/media/aerials/${id}.mp4`
export const posterUrl = (id) => `/media/aerials/${id}.jpg`

/** A clip id: "pexels-123", "mixkit-4k-2152", or a bare Pexels number from before roadmap 159. */
export const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
/** A collection saved in Settings that the catalogue no longer has means every clip. */
export const collectionOf = (collection, clips = CLIPS) =>
  collection && collection !== 'all' && clips.some(c => c.collection === collection) ? collection : 'all'
const inCollection = (collection) => (c) => collection === 'all' || c.collection === collection

/** The list in random order (Fisher and Yates). */
export function shuffle(list, random = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/**
 * The next clip (roadmap 159): random over the whole collection, whatever the hour, and every clip once before any
 * comes round again. `played` holds this round's ids; a clip in it is picked only when every ready clip has been
 * shown, and then `fresh` is false so the caller starts a new round. Only cached clips (`ready`), never `last`.
 * Returns { clip, fresh } or null when nothing else is ready.
 */
export function pickClip({ clips = CLIPS, collection = 'all', ready, last = null, played = [], random = Math.random } = {}) {
  const has = ready instanceof Set ? (id) => ready.has(id) : Array.isArray(ready) ? (id) => ready.includes(id) : () => true
  const pool = clips.filter(inCollection(collectionOf(collection, clips))).filter(c => has(c.id) && c.id !== last)
  if (!pool.length) return null
  const fresh = pool.filter(c => !played.includes(c.id))
  const from = fresh.length ? fresh : pool
  return { clip: from[Math.min(from.length - 1, Math.floor(random() * from.length))], fresh: fresh.length > 0 }
}

/**
 * What to download next: clips of the collection that are not cached, in `order` (the session's shuffled order,
 * so the first minutes bring a spread of places rather than one collection), `n` at most.
 */
export function wanted({ clips = CLIPS, collection = 'all', ready = [], n = 6, order = null } = {}) {
  const has = new Set(ready), col = collectionOf(collection, clips)
  const byId = new Map(clips.map(c => [c.id, c]))
  const list = order ? order.map(id => byId.get(id)).filter(Boolean) : clips
  return list.filter(inCollection(col)).filter(c => !has.has(c.id)).slice(0, n).map(c => c.id)
}

/** Who filmed the clips, for Settings. */
export const aerialCredits = (clips = CLIPS) => [...new Set(clips.map(c => c.by).filter(Boolean))]
