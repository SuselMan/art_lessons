import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import styles from './SidePanel.module.css'
import type { IconName } from '../../icons/iconNames'

export interface SidePanelTab<Id extends string = string> {
  id:      Id
  icon:    IconName
  title:   string
  content: ReactNode
  /** (#328) Controls that belong to the panel as a whole rather than to any one
   *  row in it — the participants tab puts the room-wide freeze here. Sits in
   *  the header strip, left of the collapse chevron, so it stays reachable no
   *  matter how far the content below is scrolled. */
  headerActions?: ReactNode
}

interface SidePanelProps<Id extends string> {
  tabs:     SidePanelTab<Id>[]
  active:   Id | null
  onSelect: (id: Id | null) => void
}

// One tab strip, one content area, shared by every docked panel (layers,
// color, …) — previously each panel carried its own strip+content shell,
// which let two of them be open at once and doubled the chrome. A single
// `active` id keeps at most one open, tab-strip style.
// `tab.title` arrives already translated — it's the caller's own label, the
// same string this panel shows in its header, so it's interpolated into the
// tooltips rather than re-looked-up here.
export function SidePanel<Id extends string>({ tabs, active, onSelect }: SidePanelProps<Id>) {
  const t = useT()
  const activeTab = tabs.find(tab => tab.id === active) ?? null

  return (
    <div className={styles.panel}>
      <div className={styles.tabStrip}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={clsx(styles.stripTab, active === tab.id && styles.stripTabActive)}
            onClick={() => onSelect(active === tab.id ? null : tab.id)}
            title={t(active === tab.id ? 'sidePanel.collapseTab' : 'sidePanel.openTab', { title: tab.title })}
            aria-label={t(active === tab.id ? 'sidePanel.collapseTab' : 'sidePanel.openTab', { title: tab.title })}
          >
            <Icon name={tab.icon} />
          </button>
        ))}
      </div>

      {activeTab && (
        <div className={styles.content}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>{activeTab.title}</span>
            {activeTab.headerActions}
            <button
              className={styles.collapseBtn}
              onClick={() => onSelect(null)}
              title={t('sidePanel.collapse')}
              aria-label={t('sidePanel.collapse')}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
          {activeTab.content}
        </div>
      )}
    </div>
  )
}
