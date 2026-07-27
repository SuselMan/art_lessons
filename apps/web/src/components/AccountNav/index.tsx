import { Link, useNavigate } from 'react-router-dom'
import { isLoggedIn, useAuth } from '../../lib/authState'
import { logout } from '../../lib/api'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import styles from './AccountNav.module.css'

/** Right-hand side of `AppHeader`: the standing navigation links, then the
 *  signed-in person's name as the last thing in the row.
 *
 *  The name is a menu trigger rather than a label — account-scoped actions
 *  (Settings, Log out, and more as they arrive) live under it instead of
 *  competing for room in the header row with the navigation. */
export function AccountNav() {
  const { me, loading, refetch } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  async function handleLogout() {
    await logout()
    await refetch()
  }

  if (loading) return null

  if (!isLoggedIn(me)) {
    return (
      <nav className={styles.nav}>
        <Link className={styles.link} to="/create">{t('nav.newLesson')}</Link>
        <Link className={styles.link} to="/login">{t('nav.logIn')}</Link>
        <Link className={styles.link} to="/login?mode=register">{t('nav.register')}</Link>
        {/* Settings stays a standing link only while signed out: the menu that
            holds it hangs off the username, and there is no username yet — and
            the language choice is exactly the thing someone may need before
            they can read the sign-up form. */}
        <Link className={styles.link} to="/settings">{t('nav.settings')}</Link>
      </nav>
    )
  }

  const displayName = me.name ?? me.email

  return (
    <nav className={styles.nav}>
      <Link className={styles.link} to="/create">{t('nav.newLesson')}</Link>
      <Link className={styles.link} to="/my-lessons">{t('nav.myLessons')}</Link>
      <Menu
        triggerClassName={styles.identity}
        triggerLabel={displayName}
        trigger={
          <>
            <Icon name="account_circle" />
            <span className={styles.identityName}>{displayName}</span>
            <Icon name="expand_more" />
          </>
        }
        actions={[
          { label: t('nav.settings'), onClick: () => navigate('/settings') },
          { label: t('nav.logOut'), onClick: () => { void handleLogout() } },
        ]}
      />
    </nav>
  )
}
