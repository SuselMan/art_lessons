import logoSvg from '../assets/logo.svg?raw'

import styles from './Logo.module.css'

/** One artwork for every app logo. The compact view removes the wordmark,
 * keeping the letter at the same size as in the full version. The wordmark
 * follows currentColor; the supplied brush lettering keeps its own colors.
 * Landing and app icons also read src/assets/logo.svg. */
export function Logo({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  const svg = variant === 'mark'
    ? logoSvg
      .replace(/^[ \t]*<g id="logo-wordmark"[\s\S]*?<\/g>/m, '')
      .replace(/viewBox="[^"]*"/, 'viewBox="40 0 316 388"')
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
