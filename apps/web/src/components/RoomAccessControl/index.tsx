import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RoomAccessMode } from '@grafetto/shared'

import {
  addRoomInvite, ApiError, fetchMe, getRoomAccess, kickFromRoom, removeRoomInvite, resolveJoinRequest,
  setRoomAccess, unblockFromRoom,
} from '../../lib/api'
import { useT } from '../../i18n'
import { notifyError } from '../../stores/noticeStore'
import { Icon } from '../Icon'
import { ErrorState } from '../ListState'
import { OptionGroup } from '../OptionGroup'
import { TextInput } from '../TextInput'
import styles from './RoomAccessControl.module.css'

interface RoomAccessControlProps {
  roomId: string
}

/** Who may enter one room, in one panel (#228, release track #314 §6).
 *
 *  Deliberately knows nothing about where it is mounted. It is rendered both
 *  from the lesson list's ⋮ (#229), where no socket for this room exists, and
 *  from inside the room itself (#230), where one does — and it behaves the
 *  same in both, because every effect it has is a REST call whose result is
 *  durable. Removing someone who happens to be connected right now
 *  disconnects them, but that is the server's doing (#227), not a second mode
 *  this component has to have.
 *
 *  Owner-only, and only as courtesy: every endpoint behind it answers 403 to
 *  anyone else, so hiding the panel is about not offering an action that
 *  fails, never about being the thing that prevents it.
 */
export function RoomAccessControl({ roomId }: RoomAccessControlProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const [inviteDraft, setInviteDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  // Which participant's "revoke" is waiting for a second click. Inline rather
  // than a ConfirmDialog: only one modal can be open at a time (see
  // components/Modal's modalSlot), so a dialog raised from inside this panel
  // closes the panel underneath it — the owner confirms a kick and lands back
  // in the lesson list. MyLessons' own cards already confirm deletion this
  // way, in the row.
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null)

  const queryKey = ['room', roomId, 'access']
  const { data: access, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getRoomAccess(roomId),
    // Someone can join the queue while this is open, and in the lesson list
    // there is no socket for this room to hear `join_request_created` on
    // (#227) — so "nobody is waiting" would keep saying that while a student
    // waits. Polling only runs while the panel is mounted, which is only
    // while the owner is looking at it.
    refetchInterval: 10_000,
  })

  // The panel is owner-only, so "me" is the owner — enough to know which row
  // in the participants list is the person reading it. Served from the same
  // cache the app warms on load (App.tsx), so this costs no request.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  /** Every mutation here changes something the panel displays, and the server
   *  is the only thing that knows the whole result (an invite can resolve a
   *  queued request; a kick clears an invite). Refetching the one query is
   *  both simpler and more honest than patching five lists by hand. */
  const reload = () => queryClient.invalidateQueries({ queryKey })

  const fail = (message: string, key: string) => notifyError(message, { key })

  const modeMutation = useMutation({
    mutationFn: (accessMode: RoomAccessMode) => setRoomAccess(roomId, { accessMode }),
    onSuccess: reload,
    onError: () => fail(t('access.error.mode'), 'access-mode'),
  })

  const passwordMutation = useMutation({
    mutationFn: (password: string | null) => setRoomAccess(roomId, { password }),
    onSuccess: () => { setPasswordDraft(''); void reload() },
    onError: () => fail(t('access.error.password'), 'access-password'),
  })

  const inviteMutation = useMutation({
    mutationFn: (email: string) => addRoomInvite(roomId, email),
    onSuccess: () => { setInviteDraft(''); void reload() },
    // The server's own check is the one that matters (it is what keeps a
    // typo out of a permanent row); this just says which of the two things
    // went wrong, so "invalid" doesn't read as "the network failed".
    onError: err => fail(
      t(err instanceof ApiError && err.code === 'invalid_email'
        ? 'access.error.inviteInvalid'
        : 'access.error.invite'),
      'access-invite',
    ),
  })

  const uninviteMutation = useMutation({
    mutationFn: (email: string) => removeRoomInvite(roomId, email),
    onSuccess: reload,
    onError: () => fail(t('access.error.uninvite'), 'access-uninvite'),
  })

  const requestMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      resolveJoinRequest(roomId, id, approved),
    onSuccess: reload,
    onError: () => fail(t('access.error.request'), 'access-request'),
  })

  const blockMutation = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      blocked ? kickFromRoom(roomId, userId) : unblockFromRoom(roomId, userId),
    onSuccess: reload,
    onError: () => fail(t('access.error.block'), 'access-block'),
  })

  if (isError) return <ErrorState message={t('access.error.load')} onRetry={() => void refetch()} />
  if (isPending || !access) return <div className={styles.loading}>{t('common.loading')}</div>

  const inviteOnly = access.accessMode === 'invite_only'

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.modeHeading')}</h3>
        <OptionGroup
          variant="list"
          selection="radio"
          ariaLabel={t('access.modeHeading')}
          active={access.accessMode}
          onSelect={mode => modeMutation.mutate(mode)}
          options={[
            { id: 'anyone_with_link', label: t('access.mode.anyoneWithLink') },
            { id: 'invite_only', label: t('access.mode.inviteOnly') },
          ]}
        />
        <p className={styles.hint}>
          {t(inviteOnly ? 'access.mode.inviteOnlyHint' : 'access.mode.anyoneWithLinkHint')}
        </p>
      </section>

      {/* A password is a separate gate, not a third mode: it applies in both,
          and the panel says so by keeping it its own row rather than a fourth
          radio option (see schema.prisma's accessMode comment). */}
      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.passwordHeading')}</h3>
        {access.hasPassword ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              <Icon name="lock" />
              {t('access.passwordSet')}
            </span>
            <button
              type="button"
              className={styles.textButton}
              disabled={passwordMutation.isPending}
              onClick={() => passwordMutation.mutate(null)}
            >
              {t('access.passwordRemove')}
            </button>
          </div>
        ) : (
          <form
            className={styles.row}
            onSubmit={e => {
              e.preventDefault()
              if (passwordDraft) passwordMutation.mutate(passwordDraft)
            }}
          >
            <TextInput
              icon="lock_open"
              type="password"
              autoComplete="new-password"
              value={passwordDraft}
              placeholder={t('access.passwordPlaceholder')}
              onChange={e => setPasswordDraft(e.target.value)}
            />
            <button type="submit" className={styles.textButton} disabled={!passwordDraft || passwordMutation.isPending}>
              {t('access.passwordSave')}
            </button>
          </form>
        )}
      </section>

      {/* Shown in both modes on purpose: an allow-list can be prepared before
          the room is switched over, and losing it from view the moment the
          mode is flipped back would read as having lost the list itself. */}
      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.invitesHeading')}</h3>
        {!inviteOnly && <p className={styles.hint}>{t('access.invitesInactiveHint')}</p>}
        <form
          className={styles.row}
          onSubmit={e => {
            e.preventDefault()
            const email = inviteDraft.trim()
            if (email) inviteMutation.mutate(email)
          }}
        >
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="off"
            value={inviteDraft}
            placeholder={t('access.invitePlaceholder')}
            onChange={e => setInviteDraft(e.target.value)}
          />
          <button type="submit" className={styles.textButton} disabled={!inviteDraft.trim() || inviteMutation.isPending}>
            {t('access.inviteAdd')}
          </button>
        </form>
        {access.invites.length === 0 ? (
          <p className={styles.empty}>{t('access.invitesEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {access.invites.map(invite => (
              <li key={invite.email} className={styles.listRow}>
                <span className={styles.person}>{invite.email}</span>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t('access.inviteRemove')}
                  title={t('access.inviteRemove')}
                  disabled={uninviteMutation.isPending}
                  onClick={() => uninviteMutation.mutate(invite.email)}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Only in invite_only: in the open mode nobody is ever queued, so the
          section would be a permanently empty box explaining its own absence. */}
      {inviteOnly && (
        <section className={styles.section}>
          <h3 className={styles.heading}>
            {t('access.requestsHeading')}
            {access.pendingRequests.length > 0 && (
              <span className={styles.count}>{access.pendingRequests.length}</span>
            )}
          </h3>
          {access.pendingRequests.length === 0 ? (
            <p className={styles.empty}>{t('access.requestsEmpty')}</p>
          ) : (
            <ul className={styles.list}>
              {access.pendingRequests.map(request => (
                <li key={request.id} className={styles.listRow}>
                  <span className={styles.person}>
                    <span className={styles.personName}>{request.name}</span>
                    {/* The address they are asking with — the difference
                        between recognizing a student and guessing. */}
                    {request.email && <span className={styles.personSub}>{request.email}</span>}
                  </span>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={requestMutation.isPending}
                    onClick={() => requestMutation.mutate({ id: request.id, approved: true })}
                  >
                    {t('access.approve')}
                  </button>
                  <button
                    type="button"
                    className={styles.textButtonQuiet}
                    disabled={requestMutation.isPending}
                    onClick={() => requestMutation.mutate({ id: request.id, approved: false })}
                  >
                    {t('access.deny')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.participantsHeading')}</h3>
        {access.participants.length === 0 ? (
          <p className={styles.empty}>{t('access.participantsEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {access.participants.map(participant => {
              // You are in this list — you have been in the room — but there
              // is nothing here to do to yourself. The server refuses it
              // anyway (`cannot_kick_owner`); offering a button that 400s
              // would just be a menu that lies.
              const isSelf = participant.userId === me?.userId
              const confirming = confirmingRevoke === participant.userId
              return (
                <li key={participant.userId} className={styles.listRow}>
                  <span className={styles.person}>
                    <span className={styles.personName}>
                      {participant.name ?? t('access.unnamedParticipant')}
                    </span>
                    {(participant.blocked || isSelf) && (
                      <span className={styles.personSub}>
                        {t(isSelf ? 'access.you' : 'access.revoked')}
                      </span>
                    )}
                  </span>
                  {isSelf ? null : participant.blocked ? (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={blockMutation.isPending}
                      onClick={() => blockMutation.mutate({ userId: participant.userId, blocked: false })}
                    >
                      {t('access.restore')}
                    </button>
                  ) : confirming ? (
                    <>
                      <button
                        type="button"
                        className={styles.textButtonDanger}
                        disabled={blockMutation.isPending}
                        onClick={() => {
                          setConfirmingRevoke(null)
                          blockMutation.mutate({ userId: participant.userId, blocked: true })
                        }}
                      >
                        {t('access.revokeConfirm')}
                      </button>
                      <button
                        type="button"
                        className={styles.textButtonQuiet}
                        onClick={() => setConfirmingRevoke(null)}
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.textButtonDanger}
                      disabled={blockMutation.isPending}
                      onClick={() => setConfirmingRevoke(participant.userId)}
                    >
                      {t('access.revoke')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
