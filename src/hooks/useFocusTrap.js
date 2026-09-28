import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * For the overlays that cover the page (quick add, search, the key sheet, the brief, the close): while
 * `open`, Tab and Shift Tab go round the controls inside `ref` instead of wandering into the page behind
 * the veil, and when it closes, focus goes back to whatever had it before, unless something else has
 * taken it meanwhile. `restore: false` leaves focus alone, for a dialog that hands it on itself.
 */
export default function useFocusTrap(ref, open, { restore = true } = {}) {
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const box = ref.current
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0], last = items.at(-1), cur = document.activeElement
      if (!root.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
      if (e.shiftKey && cur === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (!restore || !before || before === document.body || typeof before.focus !== 'function') return
      // Only when focus is still in the closing dialog or nowhere: a page change that moved it on wins.
      setTimeout(() => {
        const now = document.activeElement
        if (before.isConnected && (!now || now === document.body || (box && box.contains(now)))) before.focus({ preventScroll: true })
      }, 0)
    }
  }, [open, ref, restore])
}
