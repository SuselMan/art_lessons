import clsx from 'clsx'
import animatedLogo from '../../assets/logo-animated.svg'
import staticLogo from '../../assets/logo.svg'
import styles from './Spinner.module.css'

/** Decorative loading mark: the surrounding status supplies the accessible text. */
export function Spinner({ size = 40, animation = 'reveal' }: { size?: number; animation?: 'reveal' | 'rotate' }) {
  return (
    <picture className={clsx(styles.spinner, animation === 'rotate' && styles.rotate)} style={{ width: size, height: size }} aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet={staticLogo} />
      <img src={animation === 'rotate' ? staticLogo : animatedLogo} alt="" draggable={false} />
    </picture>
  )
}
