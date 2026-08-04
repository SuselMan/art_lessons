import { QueryClient } from '@tanstack/react-query'

// One shared instance — created here (not inside a component) so main.tsx can
// prefetch into it before the app tree even mounts, and every useQuery(['me'])
// consumer afterward reads that same cached result instead of re-fetching.
export const queryClient = new QueryClient()

/** (#380) One room's access state — mode, password, invites, waiting queue,
 *  everyone who has ever been in it (`getRoomAccess`).
 *
 *  Exported as a function rather than spelled out at each call site because
 *  two different surfaces now read the same server state and must never drift
 *  apart: the access panel (`RoomAccessControl`, #228) and the waiting queue
 *  in the room's participants tab (#380). Sharing the key is what makes
 *  approving someone in one of them update the other with no extra plumbing. */
export function roomAccessQueryKey(roomId: string): readonly unknown[] {
  return ['room', roomId, 'access']
}
