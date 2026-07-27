import { Link } from 'react-router-dom'

import { AccountNav } from '../AccountNav'
import { Logo } from '../Logo'

import styles from './AppHeader.module.css'

/** The app's top bar, shared by every page outside the editor (`/create`,
 *  `/my-lessons`, `/settings`). The editor has its own, much denser header —
 *  see pages/Room.
 *
 *  Wordmark on the left, account on the right, and nothing in between: the bar
 *  itself is anchored to the viewport, not to a page's content column, so the
 *  logo sits in exactly the same spot on every screen (see the CSS for why
 *  that stopped being true). */
export function AppHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.logo} to="/" aria-label="Grafetto">
        <Logo />
      </Link>
      <AccountNav />
    </header>
  )
}
