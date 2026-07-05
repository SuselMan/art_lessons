import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, type Me } from './api'

// A plain query key, not a Context — React Query's cache already shares one
// result across every useAuth() caller, so a Context here would just be
// duplicating what the cache does for free. main.tsx prefetches this exact
// key before the app tree mounts (see queryClient.ts), so the very first
// render already has `me` instead of flashing a loading state.
export const ME_QUERY_KEY = ['me'] as const

export interface AuthState {
  me: Me | null
  loading: boolean
  refetch: () => Promise<void>
}

export function useAuth(): AuthState {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: Infinity })

  return {
    me: data ?? null,
    loading: isLoading,
    // Identity only changes on register/login/logout, all of which the
    // caller already awaited — invalidate (not just refetch) so a stale
    // in-flight request from elsewhere can't clobber the fresh result.
    refetch: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  }
}

/** Convenience predicate — a Me with a null email is an anonymous guest
 *  (#41's default identity), not a registered account. */
export function isLoggedIn(me: Me | null): me is Me & { email: string } {
  return me !== null && me.email !== null
}
