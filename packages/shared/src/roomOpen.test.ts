import { describe, expect, it } from 'vitest'
import { parseRoomOpenMeasurement, type RoomOpenMeasurement } from './roomOpen.js'

const measurement: RoomOpenMeasurement = {
  attemptId: '2b4fdeac-96a6-4b1b-8cf6-aaea2f94f144', roomId: 'room-1', appVersion: 'dev',
  deviceType: 'tablet', wasHidden: false,
  report: { outcome: 'ready', totalMs: 2400, reached: 'replay',
    stages: { join: 400, paper: 50, snapshot: 1900, replay: 50 }, facts: { layers: 3, snapshotSeq: null } },
}

describe('room open diagnostic input', () => {
  it('accepts fast finishes and excludes unsolicited data', () => {
    expect(parseRoomOpenMeasurement({ ...measurement, email: 'do not store',
      report: { ...measurement.report, facts: { ...measurement.report.facts, canvas: 'do not store' } } })).toEqual(measurement)
  })
  it('rejects impossible times and inconsistent phase totals', () => {
    for (const totalMs of [-1, Infinity, NaN, .5, 86400_001, 10]) {
      expect(parseRoomOpenMeasurement({ ...measurement, report: { ...measurement.report, totalMs } })).toBeNull()
    }
    expect(parseRoomOpenMeasurement({ ...measurement, report: { ...measurement.report, stages: { replay: 2400, paper: 100 } } })).toBeNull()
  })
  it('requires bounded identifiers, device data and valid counters', () => {
    expect(parseRoomOpenMeasurement(null)).toBeNull()
    expect(parseRoomOpenMeasurement({ ...measurement, attemptId: 'not-an-id' })).toBeNull()
    expect(parseRoomOpenMeasurement({ ...measurement, roomId: 'a'.repeat(81) })).toBeNull()
    expect(parseRoomOpenMeasurement({ ...measurement, wasHidden: 'false' })).toBeNull()
    expect(parseRoomOpenMeasurement({ ...measurement, report: { ...measurement.report, facts: { layers: -1 } } })).toBeNull()
  })
})
