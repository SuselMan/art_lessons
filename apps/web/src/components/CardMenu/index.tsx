import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Menu, type MenuAction } from '../Menu'
import styles from './CardMenu.module.css'

/** Re-exported under the old name so room/folder card call sites keep reading
 *  the way they did; the shape is the shared `MenuAction`. */
export type CardMenuAction = MenuAction

interface CardMenuProps {
  actions: CardMenuAction[]
}

/** The "⋮" popover on room and folder cards (#211 epic, #216) — now just the
 *  card's trigger chrome around the shared `Menu`, which owns the open/close
 *  and dismiss behaviour. */
export function CardMenu({ actions }: CardMenuProps) {
  const t = useT()
  return (
    <Menu
      actions={actions}
      triggerClassName={styles.trigger}
      triggerLabel={t('common.moreActions')}
      trigger={<Icon name="more_vert" />}
    />
  )
}
