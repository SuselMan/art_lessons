import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchMe } from './api'
import { AuthContext, type AuthContextValue } from './authState'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthContextValue['me']>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const result = await fetchMe()
    setMe(result)
  }, [])

  useEffect(() => {
    refetch().finally(() => setLoading(false))
  }, [refetch])

  return <AuthContext.Provider value={{ me, loading, refetch }}>{children}</AuthContext.Provider>
}
