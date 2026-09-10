import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchMe } from '../../lib/api'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { ErrorState } from '../ListState'
import { OptionGroup } from '../OptionGroup'
import { TextInput } from '../TextInput'
import { useRoomAccessSource, type RoomAccessDraft } from './useRoomAccessSource'
import styles from './RoomAccessControl.module.css'

export { EMPTY_ROOM_ACCESS_DRAFT, type RoomAccessDraft } from './useRoomAccessSource'

interface RoomAccessControlProps {
  /** The room to control. Omit for the creation form, where no room exists
   *  yet — `draft` is then required and collects the same choices. */
  roomId?: string
  draft?: { value: RoomAccessDraft; onChange: (next: RoomAccessDraft) => void }
}

/** Who may enter one room, in one panel (#228, release track #314 §6).
 *
 *  Deliberately knows nothing about where it is mounted. It is rendered from
 *  the lesson list's ⋮ (#229), where no socket for this room exists, from
 *  inside the room itself (#230), where one does — and (#548) from the room
 *  *creation* form, where the room does not exist at all yet. The first two
 *  behave the same because every effect the panel has is a REST call whose
 *  result is durable; removing someone who happens to be connected right now
 *  disconnects them, but that is the server's doing (#227), not a second mode
 *  this component has to have.
 *
 *  The third is the one real difference, and it is confined to
 *  `useRoomAccessSource`: with no room id every action accumulates into a
 *  draft that travels with the navigation instead of reaching the server. The
 *  only thing this component reads about it is `source.live`, and not to
 *  change how a button behaves — to leave out the two sections that describe
 *  people (who is in, who is waiting), because a room that does not exist has
 *  neither, and rendering them empty would announce a hole rather than an
 *  absence.
 *
 *  Owner-only, and only as courtesy: every endpoint behind it answers 403 to
 *  anyone else, so hiding the panel is about not offering an action that
 *  fails, never about being the thing that prevents it.
 */
export function RoomAccessControl({ roomId, draft }: RoomAccessControlProps) {
  const t = useT()
  const [inviteDraft, setInviteDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  // Which participant's "revoke" is waiting for a second click. Inline rather
  // than a ConfirmDialog: only one modal can be open at a time (see
  // components/Modal's modalSlot), so a dialog raised from inside this panel
  // closes the panel underneath it — the owner confirms a kick and lands back
  // in the lesson list. MyLessons' own cards already confirm deletion this
  // way, in the row.
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null)

  const source = useRoomAccessSource({ roomId, draft })

  // The panel is owner-only, so "me" is the owner — enough to know which row
  // in the participants list is the person reading it. Served from the same
  // cache the app warms on load (App.tsx), so this costs no request.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (source.isError) return <ErrorState message={t('access.error.load')} onRetry={source.refetch} />
  if (source.isPending || !source.view) return <div className={styles.loading}>{t('common.loading')}</div>

  const access = source.view
  const inviteOnly = access.accessMode === 'invite_only'

  // Both clear their field only once the value is actually in — a rejected
  // address stays on screen next to the notice that explains it, rather than
  // vanishing and leaving the notice talking about nothing.
  async function submitPassword() {
    if (!passwordDraft) return
    if (await source.setPassword(passwordDraft)) setPasswordDraft('')
  }

  async function submitInvite() {
    const email = inviteDraft.trim()
    if (!email) return
    if (await source.addInvite(email)) setInviteDraft('')
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.modeHeading')}</h3>
        <OptionGroup
          variant="list"
          selection="radio"
          ariaLabel={t('access.modeHeading')}
          active={access.accessMode}
          onSelect={mode => source.setMode(mode)}
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
              disabled={source.busy}
              onClick={() => void source.setPassword(null)}
            >
              {t('access.passwordRemove')}
            </button>
          </div>
        ) : (
          // Not a <form>: this panel is itself rendered inside the creation
          // page's form (#548), and a nested form is invalid HTML — the inner
          // one is dropped by the parser and Enter here would submit the room.
          <div className={styles.row}>
            <TextInput
              icon="lock_open"
              type="password"
              autoComplete="new-password"
              value={passwordDraft}
              placeholder={t('access.passwordPlaceholder')}
              onChange={e => setPasswordDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submitPassword() } }}
            />
            <button
              type="button"
              className={styles.textButton}
              disabled={!passwordDraft || source.busy}
              onClick={() => void submitPassword()}
            >
              {t('access.passwordSave')}
            </button>
          </div>
        )}
      </section>

      {/* Shown in both modes on purpose: an allow-list can be prepared before
          the room is switched over, and losing it from view the moment the
          mode is flipped back would read as having lost the list itself. */}
      <section className={styles.section}>
        <h3 className={styles.heading}>{t('access.invitesHeading')}</h3>
        {!inviteOnly && <p className={styles.hint}>{t('access.invitesInactiveHint')}</p>}
        <div className={styles.row}>
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="off"
            value={inviteDraft}
            placeholder={t('access.invitePlaceholder')}
            onChange={e => setInviteDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submitInvite() } }}
          />
          <button
            type="button"
            className={styles.textButton}
            disabled={!inviteDraft.trim() || source.busy}
            onClick={() => void submitInvite()}
          >
            {t('access.inviteAdd')}
          </button>
        </div>
        {/* Says the two things that are not obvious before the room exists:
            the list can wait, and an invite reaches a person only once they
            sign in with that address (roomAccess.ts's allow-list is keyed by
            it). In a live room the same facts are already evident from the
            list itself. */}
        {!source.live && inviteOnly && <p className={styles.hint}>{t('create.invitesHint')}</p>}
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
                  disabled={source.busy}
                  onClick={() => source.removeInvite(invite.email)}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Only in invite_only: in the open mode nobody is ever queued, so the
          section would be a permanently empty box explaining its own absence.
          And only for a room that exists — before that there is nobody to have
          asked. */}
      {source.live && inviteOnly && (
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
                    disabled={source.busy}
                    onClick={() => source.resolveRequest(request.id, true)}
                  >
                    {t('access.approve')}
                  </button>
                  <button
                    type="button"
                    className={styles.textButtonQuiet}
                    disabled={source.busy}
                    onClick={() => source.resolveRequest(request.id, false)}
                  >
                    {t('access.deny')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {source.live && (
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
                        disabled={source.busy}
                        onClick={() => source.setBlocked(participant.userId, false)}
                      >
                        {t('access.restore')}
                      </button>
                    ) : confirming ? (
                      <>
                        <button
                          type="button"
                          className={styles.textButtonDanger}
                          disabled={source.busy}
                          onClick={() => {
                            setConfirmingRevoke(null)
                            source.setBlocked(participant.userId, true)
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
                        disabled={source.busy}
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
      )}
    </div>
  )
}
