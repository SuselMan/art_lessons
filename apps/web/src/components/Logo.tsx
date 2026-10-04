import logoSvg from '../assets/logo.svg?raw'

import styles from './Logo.module.css'

/** One artwork for every app logo. The compact view crops the wordmark,
 * keeping the letter at the same size as in the full version. The wordmark
 * follows currentColor; the supplied brush lettering keeps its own colors.
 * Landing and app icons also read src/assets/logo.svg. */
export function Logo({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  const svg = variant === 'mark'
    ? logoSvg.replace('viewBox="0.00 0.00 1130.00 388.00"', 'viewBox="40 0 316 388"')
    : logoSvg

  return (
    <span
      className={styles.mark}
      role="img"
      aria-label="Grafetto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
