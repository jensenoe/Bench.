import { useEffect } from 'react'

const CARDS = 'li.row[id^="task-"]'
const inField = (el) => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable))
const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0

/**
 * j and k walk the cards on the board (roadmap 88): j focuses the next visible card, k the previous one;
 * with nothing focused, j takes the first and k the last. Quiet while typing or while a dialog is open.
 * The card itself handles e, x, Alt arrows and Delete once it has focus (TaskCard.jsx).
 */
export default function useBoardKeys(active) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key !== 'j' && e.key !== 'k') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (inField(e.target) || inField(document.activeElement)) return
      if (document.querySelector('[role="dialog"]')) return
      const cards = [...document.querySelectorAll(CARDS)].filter(visible)
      if (!cards.length) return
      const cur = cards.indexOf(document.activeElement)
      const next = e.key === 'j'
        ? (cur < 0 ? 0 : Math.min(cards.length - 1, cur + 1))
        : (cur < 0 ? cards.length - 1 : Math.max(0, cur - 1))
      e.preventDefault()
      const el = cards[next]
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [active])
}
