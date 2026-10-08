import {it,expect} from 'vitest'
import {FIRST_BAND_INPUTS,validateFirstBandInputs,type FirstBandSnapshot} from './firstBandInputContract'
const packet='1cf7698e3d2fa6a713a00dad8d2e7f0d05dbb7f74139c91096e366d74560e76f'
const fixture=()=>Object.entries(FIRST_BAND_INPUTS).map(([role,v])=>({role,...v,width:1536,height:1536,bytes:9437184,rowConvention:'world-top',packetSha256:packet,sourceApi:'GL'} as FirstBandSnapshot))
it('requires all actual common GL roles and exact filters/dimensions',()=>{expect(validateFirstBandInputs(fixture(),packet)).toBe(true);for(const mutate of [(r:FirstBandSnapshot[])=>r.pop(),(r:FirstBandSnapshot[])=>r[0].filter='nearest',(r:FirstBandSnapshot[])=>r[1].sha256='9f44c7d06acd3b66e460cb7e806c59faeb4af74152d4739bb7a63de8f2a54eb2',(r:FirstBandSnapshot[])=>r[2].width=1024,(r:FirstBandSnapshot[])=>r[1].packetSha256='0'.repeat(64),(r:FirstBandSnapshot[])=>r[2]=r[0]]){const rows=fixture();mutate(rows);expect(()=>validateFirstBandInputs(rows,packet)).toThrow()}})
