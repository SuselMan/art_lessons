import { useSearchParams } from 'react-router-dom'

export const TABS = ['overview', 'users', 'lessons', 'ips', 'journal'] as const
export type Tab = typeof TABS[number]

/** Navigation state lives in the URL (`?tab=users&user=<id>`,
 *  `?tab=ips&ip=<address>`) so a link to one person's or one address's card
 *  can be pasted into a chat and opens on that card. */
export function useAdminNav() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.find(t => t === tabParam) ?? 'overview'
  return {
    tab,
    userId: params.get('user'),
    ip: params.get('ip'),
    openTab: (next: Tab) => setParams({ tab: next }),
    openUser: (id: string) => setParams({ tab: 'users', user: id }),
    openIp: (ip: string) => setParams({ tab: 'ips', ip }),
    closeDetail: () => setParams({ tab }),
  }
}

export type AdminNav = ReturnType<typeof useAdminNav>
