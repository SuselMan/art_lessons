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
  /** (#380) A count drawn on this tab's strip button. The strip is the only
   *  part of the panel that is always on screen, so it is the only place a
   *  "somebody needs you now" signal can live and still be seen with the panel
   *  collapsed. 0 or undefined draws nothing. */
  badge?: number
  /** What the badge means, already translated — appended to the button's
   *  accessible name while the badge is showing. A bare number read out on its
   *  own says nothing. */
  badgeLabel?: string
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
        {tabs.map(tab => {
          const action = t(active === tab.id ? 'sidePanel.collapseTab' : 'sidePanel.openTab', { title: tab.title })
          // Joined rather than built from a sentence template: the badge's
          // meaning belongs to whoever set it, and gluing the two with a
          // separator (as ParticipantsPanel does for its status tags) keeps
          // both halves translatable on their own.
          const label = tab.badge && tab.badgeLabel ? `${action} · ${tab.badgeLabel}` : action
          return (
            <button
              key={tab.id}
              className={clsx(styles.stripTab, active === tab.id && styles.stripTabActive)}
              onClick={() => onSelect(active === tab.id ? null : tab.id)}
              title={label}
              aria-label={label}
            >
              <Icon name={tab.icon} />
              {/* aria-hidden: the count is already in the button's own label
                  above, and a digit announced after it just repeats it. */}
              {!!tab.badge && (
                <span className={styles.stripBadge} aria-hidden="true">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </button>
          )
        })}
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
