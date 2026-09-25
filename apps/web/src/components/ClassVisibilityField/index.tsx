import type { ClassVisibility } from '@grafetto/shared'

import { useT } from '../../i18n'
import { Switch } from '../Switch'

import styles from './ClassVisibilityField.module.css'

interface ClassVisibilityFieldProps {
  value: ClassVisibility
  onChange: (next: ClassVisibility) => void
}

/** (#595, ADR 015 §6) Whether students see each other's personal boards —
 *  the lesson's one class-mode setting. On the creation form and in the
 *  room's settings, beside the toolset: both decide what the lesson puts in
 *  front of the class. Off by default (showing your work to everyone is
 *  awkward for a beginner) and switchable at any moment of a lesson. */
export function ClassVisibilityField({ value, onChange }: ClassVisibilityFieldProps) {
  const t = useT()
  return (
    <section className={styles.field}>
      <h3 className={styles.heading}>{t('class.visibility.heading')}</h3>
      <Switch
        checked={value === 'class'}
        onChange={on => onChange(on ? 'class' : 'teacher_only')}
        label={t('class.visibility.label')}
      />
      <p className={styles.hint}>{t('class.visibility.hint')}</p>
    </section>
  )
}
