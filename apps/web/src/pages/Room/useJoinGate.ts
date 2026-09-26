import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'

import { useT } from '../../i18n'
import type { JoinGateState } from './JoinGate'
import { describeJoinError, joinAttemptOutcome } from './joinError'
import type { Outbox } from './outbox'

export interface JoinGateDeps {
  /** The room id in the URL — what a joiner asks to join. */
  id: string | undefined
  /** Prefills the name field; the joiner can overwrite it. */
  myDisplayName: string
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
  latestKnownSeqRef: RefObject<number>
  /** The credentials last tried, replayed by a reconnect and by a retry. */
  lastJoinAttemptRef: RefObject<{ name: string; password?: string } | null>
  hasJoinedRef: RefObject<boolean>
  applyIdentity: (userId: string) => void
  outbox: Pick<Outbox, 'resendAll'>
  /** (#487) Starts timing the open — from the press, not from the send. */
  startOpenTimer: () => void
}

/** (#493) The joiner's gate on the Room side: what is in the form, which
 *  screen it is showing (#231), whether it has learned to ask for a password
 *  (#513), and the attempt itself — from the form, from "ask again", and
 *  automatically when the owner approves.
 *
 *  Out of Room. What an answer means is `joinAttemptOutcome` (joinError.ts);
 *  this is the state it lands in. `retryJoinRef` is for the socket effect,
 *  which is registered once per connection and must not re-subscribe every
 *  time the retry's identity changes. */
export function useJoinGate({
  id, myDisplayName, socketRef, latestKnownSeqRef, lastJoinAttemptRef, hasJoinedRef,
  applyIdentity, outbox, startOpenTimer,
}: JoinGateDeps) {
  const t = useT()
  // Prefilled, not fixed: the joiner can overwrite it in the gate, and what
  // they type is what the room sees.
  const [joinName,       setJoinName]       = useState(myDisplayName)
  const [joinPassword,   setJoinPassword]   = useState('')
  const [joinError,      setJoinError]      = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  // (#231) Which screen the gate is showing. Three of the server's refusals
  // are states of the person rather than problems with the form — there is
  // nothing to re-type when the answer is "you were blocked" or "the owner
  // hasn't answered yet" — so they replace the form instead of appearing as
  // an error under it. See JoinGateState.
  const [joinState,      setJoinState]      = useState<JoinGateState>('form')
  // (#513) Whether the gate is asking for a password yet. False until a join
  // attempt that carried none comes back refused — see joinAttemptOutcome.
  const [joinPasswordAsked, setJoinPasswordAsked] = useState(false)

  // Submits the join gate (joiner path only): connects/join_room's with the
  // entered name + optional password. Kept separate from the socket-wiring
  // effect so it can run any time after the socket exists, in response to a
  // user action rather than a connection lifecycle event.
  const attemptJoin = useCallback((name: string, password: string | undefined) => {
    if (!id) return

    setJoinError(null)
    setJoinSubmitting(true)
    // (#487) Отсюда, а не с отправки в сокет: замеряем ожидание человека.
    startOpenTimer()
    lastJoinAttemptRef.current = { name, password }
    socketRef.current?.emit(
      'join_room',
      { roomId: id, name, password, lastKnownSeq: latestKnownSeqRef.current || undefined },
      result => {
        setJoinSubmitting(false)
        const outcome = joinAttemptOutcome(result, password !== undefined)
        switch (outcome.kind) {
          // `joinError` was cleared at the top of this call, so what they see
          // is the field and the note explaining it, and nothing red.
          case 'askPassword':
            setJoinPasswordAsked(true)
            setJoinState('form')
            return
          case 'screen':
            setJoinState(outcome.state)
            return
          case 'error':
            setJoinState('form')
            setJoinError(describeJoinError(outcome.reason, t))
            return
          case 'joined':
            hasJoinedRef.current = true
            applyIdentity(outcome.userId)
            // (#298) Only now may the outbox drain — see its canSend gate.
            void outbox.resendAll()
            // room_state (already wired in the socket effect) populates
            // `config` from here, which unmounts the gate in favor of the
            // editor.
        }
      },
    )
  }, [id, applyIdentity, outbox, t, startOpenTimer, socketRef, latestKnownSeqRef, lastJoinAttemptRef, hasJoinedRef])

  // Submits the join gate's form. The name is validated here rather than in
  // `attemptJoin`, which is also called with credentials already known good
  // (a retry after approval).
  const handleJoinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = joinName.trim()
    if (!trimmed) { setJoinError(t('join.error.nameRequired')); return }
    // (#513) Only once the field is up. Before that an empty password is the
    // normal case and submitting without one is precisely how we ask; after
    // it, sending nothing again would come back as the same silent refusal
    // and look like the button did nothing.
    if (joinPasswordAsked && !joinPassword) { setJoinError(t('join.error.passwordRequired')); return }
    attemptJoin(trimmed, joinPassword || undefined)
  }, [joinName, joinPassword, joinPasswordAsked, attemptJoin, t])

  /** (#231) Asks again with whatever was entered last — from the "ask again"
   *  button after a denial, from "try again" once signed in elsewhere, and
   *  automatically when the owner approves. */
  const retryJoin = useCallback(() => {
    const last = lastJoinAttemptRef.current
    const name = last?.name ?? joinName.trim()
    if (!name) { setJoinState('form'); return }
    attemptJoin(name, last?.password)
  }, [joinName, attemptJoin, lastJoinAttemptRef])

  const retryJoinRef = useRef(retryJoin)
  retryJoinRef.current = retryJoin

  return {
    joinName, setJoinName, joinPassword, setJoinPassword, joinError, joinSubmitting,
    joinState, setJoinState, joinPasswordAsked, handleJoinSubmit, retryJoin, retryJoinRef,
  }
}
