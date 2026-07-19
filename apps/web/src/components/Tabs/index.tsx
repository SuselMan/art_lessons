import type { ReactNode } from 'react'
import clsx from 'clsx'
import styles from './Tabs.module.css'

export interface TabDef<Id extends string = string> {
  id: Id
  label: string
  content: ReactNode
}

interface TabsProps<Id extends string> {
  tabs: TabDef<Id>[]
  active: Id
  onSelect: (id: Id) => void
}

/** Generic horizontal labeled-tab strip + single content area — for a panel
 *  that always has exactly one tab open (e.g. inside a modal), unlike
 *  SidePanel's icon-strip/collapsible shape (built for a docked panel that
 *  can also be fully closed). Falls back to the first tab if `active` names
 *  one that isn't in `tabs`. */
export function Tabs<Id extends string>({ tabs, active, onSelect }: TabsProps<Id>) {
  const activeTab = tabs.find(t => t.id === active) ?? tabs[0]

  return (
    <div className={styles.tabs}>
      <div className={styles.tabStrip} role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTab?.id}
            className={clsx(styles.tab, tab.id === activeTab?.id && styles.tabActive)}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.tabPanel} role="tabpanel">
        {activeTab?.content}
      </div>
    </div>
  )
}
