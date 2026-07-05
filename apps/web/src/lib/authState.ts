import { createContext, useContext } from 'react'
import type { Me } from './api'

export interface AuthContextValue {
  me: Me | null
  loading: boolean
  refetch: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/** Convenience predicate — a Me with a null email is an anonymous guest
 *  (#41's default identity), not a registered account. */
export function isLoggedIn(me: Me | null): me is Me & { email: string } {
  return me !== null && me.email !== null
}
