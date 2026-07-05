import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Icon } from '../Icon'
import styles from './SidePanel.module.css'

export interface SidePanelTab<Id extends string = string> {
  id:      Id
  icon:    string
  title:   string
  content: ReactNode
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
export function SidePanel<Id extends string>({ tabs, active, onSelect }: SidePanelProps<Id>) {
  const activeTab = tabs.find(t => t.id === active) ?? null

  return (
    <div className={styles.panel}>
      <div className={styles.tabStrip}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={clsx(styles.stripTab, active === tab.id && styles.stripTabActive)}
            onClick={() => onSelect(active === tab.id ? null : tab.id)}
            title={active === tab.id ? `Collapse ${tab.title}` : `Open ${tab.title}`}
          >
            <Icon name={tab.icon} />
          </button>
        ))}
      </div>

      {activeTab && (
        <div className={styles.content}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>{activeTab.title}</span>
            <button className={styles.collapseBtn} onClick={() => onSelect(null)} title="Collapse">
              <Icon name="chevron_right" />
            </button>
          </div>
          {activeTab.content}
        </div>
      )}
    </div>
  )
}
