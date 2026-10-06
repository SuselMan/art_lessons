import { expect, it } from 'vitest'
import { createTestEngine, makeLayerAdd, makeStroke } from './testing/engineTestUtils'
import { OperationLog } from './src/oplog/OperationLog'

it('network layer quiet rejects closed-but-wet donors independently of open washes', () => {
  const { engine } = createTestEngine({ userId: 'A' }, { width: 8, height: 8 })
  engine.appendOperation(makeLayerAdd('A', 'L'), 'remote')
  const internal = engine as unknown as {
    _log: OperationLog; _snapshotQuiet(layer: string): boolean;
    _openWashes(ops: ReturnType<OperationLog['doneOperations']>, now: number): { open: string[] };
  }
  const water = makeStroke('A', 'L', [], {
    tool: 'watercolor', preset: 'normal:100:0', washId: 'wet', timestamp: Date.now(),
  })
  internal._log.append(water)
  internal._log.append(makeStroke('A', 'L', []))
  expect(internal._openWashes(internal._log.doneOperations(), Date.now()).open).toEqual([])
  expect(internal._snapshotQuiet('L')).toBe(false)
  expect(internal._snapshotQuiet('other')).toBe(true)
  internal._log.revoke(water.id)
  expect(internal._snapshotQuiet('L')).toBe(true)
  engine.destroy()
})
