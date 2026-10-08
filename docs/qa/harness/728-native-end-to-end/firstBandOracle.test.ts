import {it,expect} from 'vitest'
import {runFirstBandCommonOracle,packFirstBandCommonInput,type FirstBandCommonInput} from './firstBandOracle'
const valid=()=>({producerCode:'5f2e8ddd7fea6ab096beb5322070c11100da69cf',packetSha256:'1cf7698e3d2fa6a713a00dad8d2e7f0d05dbb7f74139c91096e366d74560e76f',mode:6,pressure:new Uint8Array(),inward:new Uint8Array(),coverage:new Uint8Array()} as FirstBandCommonInput)
it('rejects missing bytes/packet before any browser GPU access',async()=>{for(const fn of [runFirstBandCommonOracle,packFirstBandCommonInput]){await expect(fn(valid())).rejects.toThrow();await expect(fn({...valid(),packetSha256:'0'.repeat(64)})).rejects.toThrow();await expect(fn({...valid(),mode:12 as 6})).rejects.toThrow()}})
