import {it,expect} from 'vitest'
import {createWarmCorpusPacket} from './warmCorpusPacket'
import {warmPacketSha256} from './warmPacket'
it('isolated production CPU corpus preparation is deterministic and nonempty',async()=>{
 const a=createWarmCorpusPacket(),b=createWarmCorpusPacket()
 expect(a.commands.length).toBeGreaterThan(0);expect(a.commands.length).toBeLessThanOrEqual(64)
 expect(a.commands.some(c=>c.kind==='ribbon')).toBe(true);expect(a.commands.some(c=>c.phase==='pigment')).toBe(true);expect(a.commands.some(c=>c.phase==='color')).toBe(true)
 expect(await warmPacketSha256(a)).toBe(await warmPacketSha256(b))
})
