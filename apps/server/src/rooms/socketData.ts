/** Per-connection state. `userId` is resolved once, in the `io.use()`
 *  middleware below, from the same identity cookie (#41) that HTTP routes
 *  use — never re-derived per event, and never trusted from a client-
 *  supplied Operation's own `userId` field for authorization (role checks
 *  below always go through `getParticipant`, keyed by this). */
export interface SocketData {
  /** Immutable read-only transport; never owns a participant seat. */
  observer?: boolean
  // (#176) The *board* this socket draws on — its content channel. For a
  // lesson with one board it is the lesson id.
  roomId?: string
  // (#176) The lesson the socket is in — its social channel (see
  // lessonChannel). Set with `roomId` and outlives board switches.
  lessonId?: string
  userId?: string
  // (#590) The handshake's client address, so an IP ban can close the sockets
  // already open from it (adminRoutes.ts).
  ip?: string
}
