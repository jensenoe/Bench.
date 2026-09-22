/**
 * Capabilities the desktop shell provides that plain Node cannot:
 * a persistent, logged-in browser session for the tom.fit tools.
 * Electron fills these in before the server starts. Under `npm start`
 * they stay null and the cookie-based sources report themselves as
 * desktop-only.
 */
export const bridge = {
  desktop: false,
  /** fetch(url, init) using the persisted tom.fit session cookies */
  fetchWithSession: null,
  /** load a page in a hidden window and evaluate JS in it; resolves to the JS result */
  runInSite: null,
  /** open a visible window to a URL so the user can sign in; resolves when closed */
  openSignIn: null,
  /** is there a live session for this origin? */
  hasSession: null,
  /** desktop notification; { title, body, route } - route is a hash the window jumps to on click */
  notify: null
}
