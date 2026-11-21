import logoSvg from '../assets/logo.svg?raw'

import styles from './Logo.module.css'

/** The same brand mark is used throughout the application. */
export function Logo() {
  return (
    <span
      className={styles.mark}
      role="img"
      aria-label="Grafetto"
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  )
}
