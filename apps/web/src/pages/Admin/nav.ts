import { useSearchParams } from 'react-router-dom'

export const TABS = ['overview', 'users', 'lessons', 'journal'] as const
export type Tab = typeof TABS[number]

/** Navigation state lives in the URL (`?tab=users&user=<id>`) so a link to
 *  one person's card can be pasted into a chat and opens on that card. */
export function useAdminNav() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.find(t => t === tabParam) ?? 'overview'
  const userId = params.get('user')
  return {
    tab,
    userId,
    openTab: (next: Tab) => setParams({ tab: next }),
    openUser: (id: string) => setParams({ tab: 'users', user: id }),
    closeUser: () => setParams({ tab }),
  }
}
