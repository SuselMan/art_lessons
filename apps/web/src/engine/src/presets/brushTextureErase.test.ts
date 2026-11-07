import {expect,it} from 'vitest'
import {textureEffectiveInvert,textureEraseId} from './brushTextureErase'
it('uses authored inversion XOR additional inversion only for recorded erase',()=>{
 for(const authored of [false,true])for(const auto of [false,true])for(const erase of [false,true])expect(textureEffectiveInvert(authored,auto,erase)).toBe(authored!==(auto&&erase))
})
it('selects normal→erase→normal without mutating the source or substituting missing historical variants',()=>{
 const texture=Object.freeze({id:'asset:normal',eraseId:'asset:erase'})
 expect([false,true,false].map(mode=>textureEraseId(texture,mode))).toEqual(['asset:normal','asset:erase','asset:normal'])
 expect(textureEraseId({id:'cloud'},true)).toBe('cloud');expect(textureEraseId(undefined,true)).toBeUndefined();expect(texture.id).toBe('asset:normal')
})
it('demonstrates why post-inversion of the compiled normal asset violates neutral/cutoff ordering',()=>{
 // Independent normalized native preprocessing witness: original value .4,
 // neutral point .25, cutoff policy1 keep [.4,.65]. No renderer is invoked.
 const fromOriginal=(invert:boolean)=>{const x=invert?.6:.4,neutral=x<=.25?x/.5:.5+(x-.25)/1.5;return neutral<.4||neutral>.65?0:neutral}
 const normal=fromOriginal(textureEffectiveInvert(false,true,false)),erase=fromOriginal(textureEffectiveInvert(false,true,true))
 expect(normal).toBeCloseTo(.6);expect(erase).toBe(0);expect(erase).not.toBeCloseTo(1-normal)
})
it('refuses a non-boolean unrecorded mode rather than interpreting a truthy UI value',()=>{
 expect(()=>textureEraseId({id:'cloud'},'erase' as unknown as boolean)).toThrow('captured')
})
