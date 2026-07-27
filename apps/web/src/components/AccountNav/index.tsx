import { Link } from 'react-router-dom'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { logout } from '../../lib/api'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import styles from './AccountNav.module.css'

export function AccountNav() {
  const { me, loading, refetch } = useAuth()
  const t = useT()

  async function handleLogout() {
    await logout()
    await refetch()
  }

  if (loading) return null

  // Settings is offered signed-out too — the language choice is exactly the
  // thing someone may need before they can read the sign-up form.
  const settingsLink = (
    <Link className={styles.link} to="/settings">{t('nav.settings')}</Link>
  )

  if (!isLoggedIn(me)) {
    return (
      <nav className={styles.nav}>
        <Link className={styles.link} to="/create">{t('nav.newLesson')}</Link>
        <Link className={styles.link} to="/login">{t('nav.logIn')}</Link>
        <Link className={styles.link} to="/login?mode=register">{t('nav.register')}</Link>
        {settingsLink}
      </nav>
    )
  }

  return (
    <nav className={styles.nav}>
      <span className={styles.identity}>
        <Icon name="account_circle" />
        {me.name ?? me.email}
      </span>
      <Link className={styles.link} to="/create">{t('nav.newLesson')}</Link>
      <Link className={styles.link} to="/my-lessons">{t('nav.myLessons')}</Link>
      {settingsLink}
      <button type="button" className={styles.link} onClick={handleLogout}>{t('nav.logOut')}</button>
    </nav>
  )
}
