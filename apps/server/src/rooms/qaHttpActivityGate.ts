import type { FastifyInstance, FastifyRequest } from 'fastify'
import { QaActivityGate, type ReleaseQaActivity } from './qaActivityGate.js'
import type { QaRoomActivity } from './qaRoomActivity.js'

/** Install before listening, and only after the dedicated QA DB lease is held.
 * A failed/aborted response may leak its lease; this is deliberately fail
 * closed: it prevents collection until restart rather than losing work.
 * This tracks HTTP only; socket handlers and detached writes need their own
 * leases for their full lifetimes before any collector may be enabled. */
export interface QaHttpRoomActivity {
  activity: QaRoomActivity
  // The boot integration must classify *all* room-bearing routes; an unknown
  // route must throw rather than silently returning null.
  resolveLesson(request: FastifyRequest): Promise<string | null>
}

export function registerQaHttpActivityGate(app: FastifyInstance, gate: QaActivityGate, roomActivity?: QaHttpRoomActivity): void {
  const leases = new WeakMap<FastifyRequest, ReleaseQaActivity>()
  app.addHook('onRequest', async (request, reply) => {
    const release = gate.tryEnter()
    if (!release) {
      return reply.code(503).send({ error: 'qa_maintenance_retry' })
    }
    leases.set(request, release)
    if (roomActivity) {
      try {
        const lessonId = await roomActivity.resolveLesson(request)
        if (lessonId !== null) await roomActivity.activity.touched(lessonId)
      } catch (error) {
        roomActivity.activity.invalidate()
        request.log.error({ err: error }, 'QA HTTP room activity failed')
        return reply.code(503).send({ error: 'qa_activity_unavailable' })
      }
    }
  })
  app.addHook('onResponse', async request => {
    leases.get(request)?.()
    leases.delete(request)
  })
}
