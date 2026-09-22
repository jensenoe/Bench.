import { useEffect, useState } from 'react'

/** Ticks every second. The scene is derived from it, so the mountains follow the same clock you see. */
export default function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
