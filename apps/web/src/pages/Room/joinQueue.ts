import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RoomAccessInfo, RoomJoinRequest } from '@grafetto/shared'

import { ApiError, getRoomAccess, resolveJoinRequest } from '../../lib/api'
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
    // A refusal is an answer, not a failure to get one — retrying a 403 three
    // times gets three 403s. Everything else (a dropped connection mid-lesson,
    // which is the common case here) keeps the default retries.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 3,
  })

  const mutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      resolveJoinRequest(roomId!, id, approved),
    // Drop the answered row the moment the server confirms, rather than
    // waiting for the refetch below to say so — a row that lingers after a
    // decision invites a second press. On failure it stays exactly where it
    // was, which is the honest state: the person is still waiting.
    onSuccess: (_result, { id }) => {
      queryClient.setQueryData<RoomAccessInfo>(queryKey, old => (
        old ? { ...old, pendingRequests: old.pendingRequests.filter(r => r.id !== id) } : old
      ))
    },
    onError: () => notifyError(t('access.error.request'), { key: 'access-request' }),
    // Either way the server is the one that knows the whole result — an
    // approval also adds a participant, and a failure may have half-applied.
    // Same reasoning as RoomAccessControl's `reload`.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
