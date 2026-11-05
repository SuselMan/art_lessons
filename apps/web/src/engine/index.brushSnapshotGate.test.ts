import { describe, expect, it } from 'vitest'
import type { StrokeOperation } from '@grafetto/shared'

import { createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'
import { digitalBrushFromPreset, digitalBrushPreset } from './src/presets/digitalBrushPresets'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

const cases: Array<{ name: string; tool: StrokeOperation['tool']; preset: string }> = [
  { name: 'stamp coverage', tool: 'digitalBrush', preset: 'hard-round' },
  { name: 'mixer reservoir', tool: 'digitalBrush', preset: 'mixer' },
  { name: 'smudge reservoir', tool: 'smudge', preset: 'smudge' },
]

function token(tool: StrokeOperation['tool'], preset: string): string {
  if (tool !== 'digitalBrush') return preset
  const brush = digitalBrushFromPreset(preset)
  return digitalBrushPreset(brush.id, brush.version)
}

function chunk(userId: string, tool: StrokeOperation['tool'], preset: string, final = false): StrokeOperation {
  return makeStroke(userId, 'ink', [dab(final ? 20 : 12, 16, { size: 12, pressure: 1, opacity: 1 })], {
    tool, preset: token(tool, preset), strokeId: `${userId}-gesture`,
    ...(final ? { strokeEnd: true as const } : {}),
  })
}

function setup() {
  const { engine } = createTestEngine({ userId: 'observer' }, { width: 32, height: 32 })
  engine.appendOperation(makeLayerAdd('alice', 'ink'), 'remote')
  // Guaranteed pre-existing pigment makes a refusal distinguishable from an
  // empty-layer result, including for smudge which adds no paint of its own.
  engine.appendOperation(makeStroke('alice', 'ink', [dab(16, 16, { size: 20, pressure: 1, opacity: 1 })]), 'remote')
  expect(engine.bakeNetworkSnapshot('ink')).not.toBeNull()
  return engine
}

describe('network snapshot gate for carried brush gestures', () => {
  it.each(cases)('does not publish an unfinished remote $name', ({ tool, preset }) => {
    const engine = setup()
    try {
      engine.appendOperation(chunk('alice', tool, preset), 'remote')
      expect(engine.bakeNetworkSnapshot('ink')).toBeNull()
      engine.appendOperation(chunk('alice', tool, preset, true), 'remote')
      const snapshot = engine.bakeNetworkSnapshot('ink')
      expect(snapshot).not.toBeNull()
      expect(decodeLayerTiles(snapshot!, 0).tiles.some(tile => tile.pixels.some(value => value > 0))).toBe(true)
    } finally { engine.destroy() }
  })

  it.each(cases)('keeps another peer from closing the unfinished $name', ({ tool, preset }) => {
    const engine = setup()
    try {
      engine.appendOperation(chunk('alice', tool, preset), 'remote')
      engine.appendOperation(chunk('bob', tool, preset, true), 'remote')
      expect(engine.bakeNetworkSnapshot('ink')).toBeNull()
      engine.appendOperation(chunk('alice', tool, preset, true), 'remote')
      expect(engine.bakeNetworkSnapshot('ink')).not.toBeNull()
    } finally { engine.destroy() }
  })
})


it.each([...cases,{name:'pencil',tool:'pencil' as const,preset:'soft'}])('does not bake live-only $name dabs before their operation arrives',({tool,preset})=>{
 const engine=setup()
 try{
  const dabs=[dab(12,16,{size:12,pressure:1,opacity:1}),dab(20,16,{size:12,pressure:1,opacity:1})]
  const strokeId='alice-live-gesture',resolved=token(tool,preset)
  engine.appendPeerLiveDabs('alice',{strokeId,layerId:'ink',tool,preset:resolved,color:[0,0,0],packetSeq:0,dabs})
  expect(engine.bakeNetworkSnapshot('ink')).toBeNull()
  engine.endPeerLiveStroke('alice',strokeId)
  expect(engine.bakeNetworkSnapshot('ink')).toBeNull()
  engine.appendOperation(makeStroke('alice','ink',dabs,{tool,preset:resolved,strokeId,strokeEnd:true}),'remote')
  expect(engine.bakeNetworkSnapshot('ink')).not.toBeNull()
 }finally{engine.destroy()}
})
