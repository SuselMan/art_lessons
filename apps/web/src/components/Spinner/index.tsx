import animatedLogo from '../../assets/logo-animated.svg'
import staticLogo from '../../assets/logo.svg'
import styles from './Spinner.module.css'

/** Decorative loading mark: the surrounding status supplies the accessible text. */
export function Spinner({ size = 40 }: { size?: number }) {
  return (
    <picture className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet={staticLogo} />
      <img src={animatedLogo} alt="" draggable={false} />
    </picture>
  )
}
