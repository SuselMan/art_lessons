import { Link } from 'react-router-dom'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { logout } from '../../lib/api'
import { Icon } from '../Icon'
import styles from './AccountNav.module.css'

export function AccountNav() {
  const { me, loading, refetch } = useAuth()

  async function handleLogout() {
    await logout()
    await refetch()
  }

  if (loading) return null

  if (!isLoggedIn(me)) {
    return (
      <nav className={styles.nav}>
        <Link className={styles.link} to="/create">New lesson</Link>
        <Link className={styles.link} to="/login">Log in</Link>
        <Link className={styles.link} to="/login?mode=register">Register</Link>
      </nav>
    )
  }

  return (
    <nav className={styles.nav}>
      <span className={styles.identity}>
        <Icon name="account_circle" />
        {me.name ?? me.email}
      </span>
      <Link className={styles.link} to="/create">New lesson</Link>
      <Link className={styles.link} to="/my-lessons">My Lessons</Link>
      <button type="button" className={styles.link} onClick={handleLogout}>Log out</button>
    </nav>
  )
}
