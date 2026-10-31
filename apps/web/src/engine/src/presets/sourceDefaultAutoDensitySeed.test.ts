import { describe, expect, it } from 'vitest'
import { sourceDefaultAutoDensitySeed, createSourceDefaultAutoDensityRandom } from './sourceDefaultAutoDensitySeed'
import { KritaRandomSource } from './nativeRandom'
import { prepareSourceDefaultAutoDensity } from './sourceDefaultAutoDab'

const identity={gestureId:'room:epoch:user:stroke',descriptorSha256:'a'.repeat(64),role:'primary' as const,drawOrdinal:0}
describe('explicit request-owned density seed behavior',()=>{
  it('matches independent UTF16 tuple-hash and Taus88 goldens',()=>{
    for(const [gestureId,drawOrdinal,seed,raw] of [
      ['room:epoch:user:stroke',0,863820666,[1284444605,554398503,2560852126]],
      ['room:epoch:user:stroke',1,863820697,[1296121790,3272233894,1797627387]],
      ['🎨/é/"\\',Number.MAX_SAFE_INTEGER,1140034460,[279638540,1947948179,4114729701]],
    ] as const){
      const input={...identity,gestureId,drawOrdinal}
      expect(sourceDefaultAutoDensitySeed(input)).toBe(seed)
      const rng=createSourceDefaultAutoDensityRandom(input)
      expect([rng.generate(),rng.generate(),rng.generate()]).toEqual(raw)
    }
    const zero=new KritaRandomSource(0)
    expect(zero.snapshot().state).toEqual([2,8,16])
    expect(zero.generate()).toBe(2105472)
  })
  it('is stable across packing, zero-draw frames, chunking and request regeneration',()=>{
    const render=(packing:readonly number[],chunk:number)=>{
      let ordinal=0;const masks:number[][]=[]
      for(const count of packing)for(let i=0;i<count;i++){
        const rng=createSourceDefaultAutoDensityRandom({...identity,drawOrdinal:ordinal++})
        const mask=new Uint8Array(100).fill(255)
        const cursor=prepareSourceDefaultAutoDensity(mask,.8,()=>rng.generateNormalized())
        while(!cursor.done)cursor.advance(chunk)
        masks.push([...mask])
      }
      return masks
    }
    expect(render([1,0,1],1)).toEqual(render([0,2,0],17))
    expect(render([2],100)).toEqual(render([2],3))
    expect(render([2],7)[0]).not.toEqual(render([2],7)[1])
    const a=createSourceDefaultAutoDensityRandom(identity),b=createSourceDefaultAutoDensityRandom(identity)
    a.generate();expect(b.snapshot().draws).toBe(0)
    expect(KritaRandomSource.restore(a.snapshot()).generate()).toBe(a.generate())
  })
  it('rejects unbounded or untyped identities without granting mask role',()=>{
    for(const input of [
      {...identity,gestureId:''},{...identity,gestureId:'x'.repeat(8193)},
      {...identity,gestureId:'x\0y'},{...identity,descriptorSha256:'A'.repeat(64)},
      {...identity,role:'mask'},{...identity,drawOrdinal:-1},
      {...identity,drawOrdinal:.5},{...identity,drawOrdinal:Number.MAX_SAFE_INTEGER+1},
    ])expect(()=>sourceDefaultAutoDensitySeed(input)).toThrow()
  })
})
