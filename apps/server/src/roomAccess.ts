import type { JoinDenial } from '@grafetto/shared'

import { prisma } from './prisma.js'
import { checkRoomPassword, getRoomGate } from './rooms.js'

/** The join gate (#225, release track #314 §6) — the single place that decides
 *  whether someone may enter a room at all. `rooms.ts`'s `joinRoom` seats
 *  whoever this admits and asks no questions of its own, deliberately: access
 *  decided in two places is access decided differently in two places.
 *
 *  Everything here reads Postgres rather than a mirror in the room record.
 *  `rooms.ts` caches plenty of durable facts in memory (palette, owner locks,
 *  alive ids) because they are consulted per *operation*; these are consulted
 *  per *join*, which happens once per person per session, so the read costs
 *  nothing worth the invalidation bug a cache would eventually produce — an
 *  invite added from #226's endpoints has to take effect on the very next
 *  attempt, including for a room that has been sitting live in memory for
 *  hours.
 */

/** Denials are ordered, and the order is the security-relevant part — see
 *  `checkJoinAccess`. */
export type JoinAccessResult =
  | { ok: true }
  | { ok: false; error: JoinDenial }

/** Decides whether `userId` may join `roomId`, and — in the one case where
 *  the answer is "ask the owner" — records the request as a side effect.
 *
 *  The order of the checks below is the specification, not an implementation
 *  detail:
 *
 *  1. **Block first.** A revoked participant is refused before anything else
 *     has a chance to admit them, so no later branch (a stale invite, an
 *     approved request from before the kick, the room being open to anyone)
 *     can hand back access the owner explicitly took away. The owner is
 *     exempt: a room whose owner can be locked out of it is a room that can
 *     be stolen.
 *  2. **Owner second, before the password.** The owner set the password; being
 *     shut out of your own lesson for not remembering it is not a security
 *     property, it is a support ticket. This is a deliberate change from the
 *     pre-#225 behaviour, where the password gated everyone equally.
 *  3. **Password third.** It gates both modes, and it gates them before the
 *     mode is even consulted, so an `invite_only` room never reveals — by
 *     answering `login_required` or by queueing a request — that a guess at
 *     its password was wrong.
 *  4. **Mode last**, since by now the caller has proven whatever the room
 *     asked of everyone.
 */
export async function checkJoinAccess(
  roomId: string, userId: string, name: string, password: string | undefined,
): Promise<JoinAccessResult> {
  const gate = getRoomGate(roomId)
  if (!gate) return { ok: false, error: 'not_found' }

  const isOwner = userId === gate.ownerId

  if (!isOwner) {
    const blocked = await prisma.roomBlock.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    })
    if (blocked) return { ok: false, error: 'access_revoked' }
  }

  if (isOwner) return { ok: true }

  if (!checkRoomPassword(roomId, password)) return { ok: false, error: 'wrong_password' }

  if (gate.accessMode === 'anyone_with_link') return { ok: true }

  return admitToInviteOnlyRoom(roomId, userId, name)
}

/** The `invite_only` branch of `checkJoinAccess`. Four ways in, in this order:
 *  already a participant, already approved, on the allow-list, or ask.
 */
async function admitToInviteOnlyRoom(
  roomId: string, userId: string, name: string,
): Promise<JoinAccessResult> {
  const [participation, request] = await Promise.all([
    prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } }, select: { id: true },
    }),
    prisma.roomJoinRequest.findUnique({
      where: { roomId_userId: { roomId, userId } }, select: { status: true },
    }),
  ])

  // Someone already in the lesson stays in it. A RoomParticipant row is only
  // ever written by a successful join (see rooms.ts's persistParticipant), so
  // this set is exactly "people who got in under the rules that were in force
  // at the time" — flipping a room to invite_only seals it against newcomers
  // rather than ejecting the class currently drawing in it. The alternative
  // was tried on paper and is worse: tablets reconnect constantly, so a
  // mid-lesson switch would drop every student into the owner's approval
  // queue at once, which is a denial of service dressed up as a security
  // control. Removing one specific person is what a block is for, and blocks
  // are checked above this.
  if (participation) return { ok: true }

  if (request?.status === 'approved') return { ok: true }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const email = user?.email
  // A guest browser (identity cookie, no email — see schema.prisma's User)
  // cannot match an allow-list keyed by address, and queueing them would ask
  // the owner to approve "someone". Signing in is the only move that can
  // change the answer, so say that instead of leaving them in a queue that
  // will never resolve into anything meaningful.
  if (!email) return { ok: false, error: 'login_required' }

  const invite = await prisma.roomInvite.findUnique({
    where: { roomId_email: { roomId, email } },
    select: { id: true },
  })
  if (invite) return { ok: true }

  // Not on the list: ask. Upsert rather than insert — one row per (room, user)
  // is what keeps a denied asker from growing this table, and the owner's
  // queue, one refresh at a time (see schema.prisma's RoomJoinRequest). A
  // previously denied request therefore reopens as pending: re-asking is not
  // forbidden, it is just visible, and the owner's answer to someone who will
  // not take no for an answer is a block.
  //
  // `name` is refreshed on every ask so the queue shows what this person calls
  // themselves now, not whatever they typed the first time.
  await prisma.roomJoinRequest.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, name, status: 'pending' },
    update: { name, status: 'pending', resolvedAt: null },
  })
  // The owner learning about it live is #227's job (join_request_created).
  // Until that lands the queue is real but only visible on a reload.
  return { ok: false, error: 'pending_approval' }
}
