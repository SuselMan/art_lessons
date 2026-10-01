import type { RoomOpenMeasurement } from '@grafetto/shared'

import { ApiError, apiResponse } from '../../../lib/api/api'

/** Separate from Sentry's warning quota and per-room deduplication. Every
 * attempt sends its finish, even if its alarm was already reported. */
export function saveRoomOpenMeasurement(measurement: RoomOpenMeasurement): void {
  const send = async (attempt: number): Promise<void> => {
    try {
      await apiResponse('POST /api/me/room-open', { body: measurement }, {
        keepalive: true, signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      // Invalid input/identity is not repaired by retries. Transient failures
      // get bounded retries, with the same id so a lost response is harmless.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) return
      if (attempt < 3) setTimeout(() => { void send(attempt + 1) }, 2000 * 2 ** attempt)
    }
  }
  // Even browser API limitations must never interrupt an open.
  void send(0)
}
