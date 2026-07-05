import { QueryClient } from '@tanstack/react-query'

// One shared instance — created here (not inside a component) so main.tsx can
// prefetch into it before the app tree even mounts, and every useQuery(['me'])
// consumer afterward reads that same cached result instead of re-fetching.
export const queryClient = new QueryClient()
