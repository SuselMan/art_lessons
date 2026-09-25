// (#548) The data half of RoomAccessControl, split out so the panel itself can
// be mounted in two places that have nothing in common except what they show.
//
// In a real room every action here is an immediate REST call keyed on a room
// id, and what the panel renders is whatever `GET /access` last said. On the
// room *creation* form there is no room yet — CreateRoom mints an id and
// navigates, and the row is written by the socket `create_room` inside Room —
// so the same actions have to accumulate into a draft that travels with the
// navigation instead.
//
// Rather than two panels that drift apart, or one panel with a branch at every
// button, the two live here behind one interface. The panel above renders a
// `RoomAccessSource` and never learns which of the two it got; the only thing
// it reads about the difference is `live`, and that is not about *how* an
// action is applied but about which sections exist at all — a room that does
// not exist yet has no participants and no waiting queue, and those sections
// are absent rather than empty.

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RoomAccessMode, RoomAccessParticipant, RoomInvite, RoomJoinRequest } from '@grafetto/shared'

import {
  addRoomInvite, ApiError, getRoomAccess, kickFromRoom, removeRoomInvite, resolveJoinRequest,
  setRoomAccess, unblockFromRoom,
} from '../../lib/api'
import { roomAccessQueryKey } from '../../lib/queryClient'
import { useT, type TFunction } from '../../i18n'
import { notifyError } from '../../stores/noticeStore'
import { useRoomStore } from '../../stores/roomStore'

/** (#232) Deliberately the same loose shape the server checks (see
 *  roomAccessRoutes.ts): this is not a claim about deliverability, it is a
 *  guard against a typo becoming a row nobody can ever match against.
 *
 *  Lives here rather than in CreateRoom, where a copy of it used to sit: in
 *  draft mode there is no server to answer, so this *is* the check, and having
 *  one address rejected in the room and accepted on the creation form would be
 *  the kind of difference nobody discovers until a student cannot get in. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Everything the access form collects before a room exists. Carried by
 *  CreateRoom and handed to Room through navigation state, which is why it is
 *  plain data: it has to survive `navigate`, not just a render. */
export interface RoomAccessDraft {
  accessMode: RoomAccessMode
  /** null = no password asked. The typed value is never shown back (the panel
   *  reports "set" / "remove", same as for a live room) — it is a credential,
   *  not a field. */
  password: string | null
  /** Addresses, in the order they were added. Sent over REST after the room
   *  exists (see Room/index.tsx), where roomAccessRoutes' own normalization
   *  and dedup take over. */
  invites: string[]
}

export const EMPTY_ROOM_ACCESS_DRAFT: RoomAccessDraft = {
  accessMode: 'anyone_with_link',
  password: null,
  invites: [],
}

/** What the panel renders. In room mode this is the server's answer; in draft
 *  mode it is assembled from the draft, with the two server-only lists empty
 *  and `live` false so the panel leaves their sections out entirely. */
export interface RoomAccessView {
  accessMode: RoomAccessMode
  hasPassword: boolean
  invites: RoomInvite[]
  pendingRequests: RoomJoinRequest[]
  participants: RoomAccessParticipant[]
}

export interface RoomAccessSource {
  /** True when this is a room that exists: the participants list and the
   *  waiting queue are real, and every action reaches the server. */
  live: boolean
  view: RoomAccessView | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
  /** Whether an action is in flight — draft mode never has one, so the panel's
   *  buttons stay live there without needing to know why. */
  busy: boolean
  setMode: (mode: RoomAccessMode) => void
  /** These two resolve `false` when the value was refused (a malformed
   *  address, a server error) — which is what lets the panel clear its input
   *  only once the value is actually in, and keep a rejected one on screen
   *  next to the notice explaining it. */
  setPassword: (password: string | null) => Promise<boolean>
  addInvite: (email: string) => Promise<boolean>
  removeInvite: (email: string) => void
  resolveRequest: (requestId: string, approved: boolean) => void
  setBlocked: (userId: string, blocked: boolean) => void
}

interface RoomAccessTarget {
  /** The room to control. Absent = draft mode; `draft` is then required. */
  roomId?: string
  draft?: { value: RoomAccessDraft; onChange: (next: RoomAccessDraft) => void }
}

function fail(t: TFunction, key: Parameters<TFunction>[0], noticeKey: string) {
  notifyError(t(key), { key: noticeKey })
}

export function useRoomAccessSource({ roomId, draft }: RoomAccessTarget): RoomAccessSource {
  const t = useT()
  const queryClient = useQueryClient()

  // (#380) Shared with the room's own waiting-queue section, which reads the
  // same server state — see roomAccessQueryKey. `enabled` rather than a
  // conditional hook: in draft mode there is nothing to fetch, and React does
  // not let a component call one hook fewer.
  const queryKey = roomAccessQueryKey(roomId ?? '')
  const { data: access, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getRoomAccess(roomId!),
    enabled: roomId !== undefined,
    // Someone can join the queue while this is open, and in the lesson list
    // there is no socket for this room to hear `join_request_created` on
    // (#227) — so "nobody is waiting" would keep saying that while a student
    // waits. Polling only runs while the panel is mounted, which is only
    // while the owner is looking at it.
    refetchInterval: 10_000,
  })

  /** Every mutation here changes something the panel displays, and the server
   *  is the only thing that knows the whole result (an invite can resolve a
   *  queued request; a kick clears an invite). Refetching the one query is
   *  both simpler and more honest than patching five lists by hand. */
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  )

  const modeMutation = useMutation({
    mutationFn: (accessMode: RoomAccessMode) => setRoomAccess(roomId!, { accessMode }),
    onSuccess: result => {
      // (#460) The editor holds the room's own accessMode in the room store —
      // the Share item's warning is decided from it — and the server has no
      // event for a mode change (#225), so the tab that made the change is the
      // one that has to say so. Guarded on the id because this same panel is
      // also mounted from the lesson list, where the store holds some other
      // room, or the last one visited.
      const store = useRoomStore.getState()
      if (store.room?.id === roomId) store.setRoomAccessMode(result.accessMode)
      // The lesson list carries `accessMode` on every room it renders, and
      // its ⋮ decides the Share warning from it — so a mode changed from that
      // very menu has to reach the list's own cache too, or the next share
      // from the same card reports the mode this one just replaced.
      void queryClient.invalidateQueries({ queryKey: ['rooms'] })
      return reload()
    },
    onError: () => fail(t, 'access.error.mode', 'access-mode'),
  })

  const passwordMutation = useMutation({
    mutationFn: (password: string | null) => setRoomAccess(roomId!, { password }),
    onSuccess: () => reload(),
    onError: () => fail(t, 'access.error.password', 'access-password'),
  })

  const inviteMutation = useMutation({
    mutationFn: (email: string) => addRoomInvite(roomId!, email),
    onSuccess: () => reload(),
    // The server's own check is the one that matters (it is what keeps a
    // typo out of a permanent row); this just says which of the two things
    // went wrong, so "invalid" doesn't read as "the network failed".
    onError: err => fail(
      t,
      err instanceof ApiError && err.code === 'invalid_email'
        ? 'access.error.inviteInvalid'
        : 'access.error.invite',
      'access-invite',
    ),
  })

  const uninviteMutation = useMutation({
    mutationFn: (email: string) => removeRoomInvite(roomId!, email),
    onSuccess: reload,
    onError: () => fail(t, 'access.error.uninvite', 'access-uninvite'),
  })

  const requestMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      resolveJoinRequest(roomId!, id, approved),
    onSuccess: reload,
    onError: () => fail(t, 'access.error.request', 'access-request'),
  })

  const blockMutation = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      blocked ? kickFromRoom(roomId!, userId) : unblockFromRoom(roomId!, userId),
    onSuccess: reload,
    onError: () => fail(t, 'access.error.block', 'access-block'),
  })

  const draftValue = draft?.value
  const draftChange = draft?.onChange

  const draftSource = useMemo<RoomAccessSource>(() => {
    const value = draftValue ?? EMPTY_ROOM_ACCESS_DRAFT
    const change = draftChange ?? (() => {})
    return {
      live: false,
      view: {
        accessMode: value.accessMode,
        hasPassword: value.password !== null,
        // Synthesized rather than stored: the draft holds addresses, and the
        // timestamp on a not-yet-sent invite would be a fact about nothing.
        // Nothing renders it — the list shows the address and a remove button.
        invites: value.invites.map(email => ({ email, invitedAt: '' })),
        pendingRequests: [],
        participants: [],
      },
      isPending: false,
      isError: false,
      refetch: () => {},
      busy: false,
      setMode: accessMode => change({ ...value, accessMode }),
      setPassword: async password => { change({ ...value, password }); return true },
      addInvite: async email => {
        const normalized = email.trim().toLowerCase()
        // Checked here as well as on the server, and not because the server
        // can't be trusted — because it answers too late to be useful: these
        // invites are sent after the room exists and this form is gone, so a
        // typo would surface as a notice inside the editor, next to no field
        // to fix it in.
        if (!EMAIL_SHAPE.test(normalized)) {
          notifyError(t('create.error.invalidInvite', { email: normalized }), { key: 'access-invite' })
          return false
        }
        if (!value.invites.includes(normalized)) change({ ...value, invites: [...value.invites, normalized] })
        return true
      },
      removeInvite: email => change({ ...value, invites: value.invites.filter(e => e !== email) }),
      // Neither exists before the room does; the panel does not render the
      // sections that would call them.
      resolveRequest: () => {},
      setBlocked: () => {},
    }
  }, [draftValue, draftChange, t])

  const liveSource = useMemo<RoomAccessSource>(() => ({
    live: true,
    view: access && {
      accessMode: access.accessMode,
      hasPassword: access.hasPassword,
      invites: access.invites,
      pendingRequests: access.pendingRequests,
      participants: access.participants,
    },
    isPending,
    isError,
    refetch: () => void refetch(),
    busy: modeMutation.isPending || passwordMutation.isPending || inviteMutation.isPending
      || uninviteMutation.isPending || requestMutation.isPending || blockMutation.isPending,
    setMode: mode => modeMutation.mutate(mode),
    // `mutateAsync` rather than `mutate` only to learn whether it landed —
    // the failure itself is already reported by the mutation's own onError,
    // so the rejection is swallowed here rather than reported twice.
    setPassword: password => passwordMutation.mutateAsync(password).then(() => true, () => false),
    addInvite: email => inviteMutation.mutateAsync(email).then(() => true, () => false),
    removeInvite: email => uninviteMutation.mutate(email),
    resolveRequest: (id, approved) => requestMutation.mutate({ id, approved }),
    setBlocked: (userId, blocked) => blockMutation.mutate({ userId, blocked }),
  }), [
    access, isPending, isError, refetch,
    modeMutation, passwordMutation, inviteMutation, uninviteMutation, requestMutation, blockMutation,
  ])

  return roomId === undefined ? draftSource : liveSource
}
