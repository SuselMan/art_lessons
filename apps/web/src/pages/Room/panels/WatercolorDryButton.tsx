import { Icon } from '../../../components/Icon'
import { useT } from '../../../i18n'
import styles from '../Room.module.css'

/** (#536, ADR 011 §17.47/48) "Высушить всё" in the watercolour's quick column.
 *  The paper dries on its own in two minutes; this is for when the wait is the
 *  problem - glazing over a wash that is only still wet on the clock. It sends
 *  a `paper_dry` operation, so it dries everyone's paper: a teacher has to be
 *  able to KNOW the student paints onto dry paper. */
export function WatercolorDryButton({ onDry }: { onDry: () => void }) {
  const t = useT()
  return (
    <button
      className={styles.toolIconBtn}
      title={t('tool.watercolor.dryAll')}
      aria-label={t('tool.watercolor.dryAll')}
      onClick={onDry}
    ><Icon name="sunny" /></button>
  )
}
