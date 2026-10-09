import {it,expect} from 'vitest'
import {createWarmCorpusPacket,createWarmCorpusLive} from './warmCorpusPacket'
import {warmPacketSha256} from './warmPacket'
it('isolated production CPU corpus preparation is deterministic and nonempty',async()=>{
 const a=createWarmCorpusPacket(),b=createWarmCorpusPacket()
 expect(a.commands.length).toBeGreaterThan(0);expect(a.commands.length).toBeLessThanOrEqual(64)
 expect(a.commands.some(c=>c.kind==='ribbon')).toBe(true);expect(a.commands.some(c=>c.phase==='pigment')).toBe(true);expect(a.commands.some(c=>c.phase==='color')).toBe(true)
 expect(await warmPacketSha256(a)).toBe(await warmPacketSha256(b))
})

it('explicit live corpus keeps canonical profile/scalars and full QA rect',()=>{
 const p=createWarmCorpusLive();expect(p.profile.compositeInkMode).toBe(9);expect(p.profile.migrate).toBe(0);expect(p.inkSmoothPx).toBe(0);expect(p.fieldSeed).toEqual([450,512]);expect(p.bounds).toEqual({minX:0,minY:0,maxX:1024,maxY:1024})
})
