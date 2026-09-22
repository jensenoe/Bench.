import { useState } from 'react'
import { motion } from 'motion/react'

/** An <img> that falls back to the scene's render if the photograph hasn't been fetched yet. */
export default function Photo({ src, fallback, className, style, animated = false, ...rest }) {
  const [cur, setCur] = useState(src)
  if (cur !== src && cur !== fallback) setCur(src)
  const onError = () => { if (fallback && cur !== fallback) setCur(fallback) }
  const Tag = animated ? motion.img : 'img'
  return <Tag src={cur} onError={onError} alt="" aria-hidden="true" className={className} style={style} {...rest} />
}
