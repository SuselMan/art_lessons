import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomOpenMeasurement } from '@grafetto/shared'

import { apiResponse } from '../../../lib/api/api'
import { saveRoomOpenMeasurement } from './saveOpen'

vi.mock('../../../lib/api/api', () => ({ apiResponse: vi.fn(), ApiError: class extends Error {} }))
const measurement: RoomOpenMeasurement = {
  attemptId: '2b4fdeac-96a6-4b1b-8cf6-aaea2f94f144', roomId: 'room-1', appVersion: 'dev',
  deviceType: 'desktop', wasHidden: false,
  report: { outcome: 'ready', totalMs: 500, stages: { join: 500 }, reached: 'join', facts: {} },
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('saving all room opens independently of Sentry', () => {
  it('sends fast finishes without waiting for the request', () => {
    vi.mocked(apiResponse).mockReturnValue(new Promise(() => {}))
    expect(saveRoomOpenMeasurement(measurement)).toBeUndefined()
    expect(apiResponse).toHaveBeenCalledWith('POST /api/me/room-open', { body: measurement }, expect.objectContaining({ keepalive: true }))
  })
  it('retries a lost response with the same attempt and preserves the finish', async () => {
    vi.useFakeTimers()
    vi.mocked(apiResponse).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response('{"ok":true}'))
    saveRoomOpenMeasurement(measurement)
    await vi.advanceTimersByTimeAsync(2000)
    expect(apiResponse).toHaveBeenCalledTimes(2)
    expect(vi.mocked(apiResponse).mock.calls[1][1]).toEqual({ body: measurement })
  })
  it('consumes the successful response without blocking the caller on its body', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":true}'))
      finish = () => controller.close()
    } }))
    vi.mocked(apiResponse).mockResolvedValueOnce(response)
    expect(saveRoomOpenMeasurement(measurement)).toBeUndefined()
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(response.bodyUsed).toBe(true)
    } finally { finish() }
    await vi.advanceTimersByTimeAsync(20_000)
    expect(apiResponse).toHaveBeenCalledTimes(1)
  })
  it('retries a response body failure with the same id after receiving headers', async () => {
    vi.useFakeTimers()
    let fail!: () => void
    const response = new Response(new ReadableStream({ start(controller) {
      fail = () => controller.error(new Error('body interrupted'))
    } }))
    vi.mocked(apiResponse).mockResolvedValueOnce(response).mockResolvedValueOnce(new Response('{"ok":true}'))
    saveRoomOpenMeasurement(measurement)
    await vi.advanceTimersByTimeAsync(0)
    fail()
    await vi.advanceTimersByTimeAsync(2000)
    expect(apiResponse).toHaveBeenCalledTimes(2)
    expect(vi.mocked(apiResponse).mock.calls[1][1]).toEqual({ body: measurement })
  })
})
