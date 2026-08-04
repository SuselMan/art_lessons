import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RoomAccessInfo, RoomJoinRequest } from '@grafetto/shared'

import { getRoomAccess, resolveJoinRequest } from '../../lib/api'
import { roomAccessQueryKey } from '../../lib/queryClient'
import { useT } from '../../i18n'
import { notifyError } from '../../stores/noticeStore'

/** Stable identity for "nobody is waiting", so a room with an empty queue —
 *  which is every room, almost always — never hands ParticipantsPanel a fresh
 *  array and defeats its `memo` on every one of Room's pan-time re-renders
 *  (#127). */
const NO_REQUESTS: RoomJoinRequest[] = []

export interface JoinQueue {
  /** Who is waiting right now, oldest first (the server's own order). Always
   *  empty for anyone but the owner — nobody else may read the queue. */
  requests: RoomJoinRequest[]
  /** Which row's answer is in flight, so that row can disable its buttons
   *  without freezing the rest of the queue. */
  resolvingId: string | null
  resolve: (requestId: string, approved: boolean) => void
}

/** (#380) The room's waiting queue, live.
 *
 *  Deliberately stored in the react-query cache rather than in the room store,
 *  against the project's usual "room state lives in Zustand" rule: this is
 *  server state that a *second* surface already owns — `RoomAccessControl`
 *  (#228), reachable from this same room's settings — and both surfaces let
 *  the owner answer the same request. Sharing one cache entry
 *  (`roomAccessQueryKey`) is what keeps answering in one of them from leaving
 *  a ghost row in the other. The store would need a second copy plus a rule
 *  for which one wins.
 *
 *  Fetched once on entering the room and then kept current by the socket (see
 *  `applyJoinRequestCreated`), not by polling: the room has a live connection
 *  and `join_request_created` is addressed to the owner personally (#227).
 *  The access panel keeps its own `refetchInterval` because the lesson list,
 *  where it is also mounted, has no socket for that room at all.
 */
export function useJoinQueue(roomId: string | undefined, isOwner: boolean): JoinQueue {
  const t = useT()
  const queryClient = useQueryClient()
  const queryKey = roomAccessQueryKey(roomId ?? '')

  // Owner-only, and only as courtesy: `GET /access` answers 403 to everyone
  // else (roomAccessRoutes.ts), so this is about not making a request that is
  // going to be refused, never about being what enforces it.
  const { data } = useQuery({
    queryKey,
    queryFn: () => getRoomAccess(roomId!),
    enabled: !!roomId && isOwner,
  })

  const mutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      resolveJoinRequest(roomId!, id, approved),
    // Drop the answered row immediately — the owner has decided, and a row
    // that lingers for a round trip invites a second press. The invalidate
    // behind it is what reconciles everything else the answer moved (an
    // approval also adds a participant), and what corrects this guess if the
    // server disagreed.
    onSettled: (_result, _err, { id }) => {
      queryClient.setQueryData<RoomAccessInfo>(queryKey, old => (
        old ? { ...old, pendingRequests: old.pendingRequests.filter(r => r.id !== id) } : old
      ))
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => notifyError(t('access.error.request'), { key: 'access-request' }),
  })

  // `mutate` keeps its identity across renders (react-query guarantees it),
  // so this callback is stable — which is what lets ParticipantsPanel's memo
  // hold through Room's pan-time re-renders.
  const { mutate, isPending, variables } = mutation
  const resolve = useCallback(
    (requestId: string, approved: boolean) => mutate({ id: requestId, approved }),
    [mutate],
  )

  return {
    requests: isOwner ? data?.pendingRequests ?? NO_REQUESTS : NO_REQUESTS,
    resolvingId: isPending ? variables?.id ?? null : null,
    resolve,
  }
}

/** (#380/#227) Someone just asked to be let in — fold them into the cached
 *  queue so the panel (and the tab's badge) shows them without a refetch.
 *
 *  Takes the roomId off the event rather than from the caller: the event is
 *  addressed to the owner as a person, so a tab sitting in room A can hear
 *  about room B. Writing under B's key is then either a no-op (nothing cached
 *  for it here) or exactly right (the access panel for B happens to be open).
 *
 *  The invalidate is the safety net for the one ordering this can't patch:
 *  the event landing while the first fetch is still in flight, which would
 *  otherwise resolve over the top of it with a queue from a moment ago. */
export function applyJoinRequestCreated(
  queryClient: QueryClient, roomId: string, request: RoomJoinRequest,
): void {
  const queryKey = roomAccessQueryKey(roomId)
  queryClient.setQueryData<RoomAccessInfo>(queryKey, old => {
    if (!old || old.pendingRequests.some(r => r.id === request.id)) return old
    return { ...old, pendingRequests: [...old.pendingRequests, request] }
  })
  void queryClient.invalidateQueries({ queryKey })
}

/** (#380/#227) Re-read the queue after a resolution this client did not make.
 *
 *  Today this is reachable only in theory: `join_request_resolved` is
 *  addressed to the *asker* (roomAccessRoutes.ts notifies `queued.userId`),
 *  so an owner sitting in the room never hears their own decisions — those
 *  come back through the mutation that made them. It is wired anyway because
 *  it is the only correct reaction available: the payload says whether a
 *  request was approved but not which one, so there is nothing to patch, only
 *  something to re-read. */
export function refreshJoinQueue(queryClient: QueryClient, roomId: string): void {
  void queryClient.invalidateQueries({ queryKey: roomAccessQueryKey(roomId) })
}
