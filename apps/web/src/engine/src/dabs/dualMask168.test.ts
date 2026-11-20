import{SmudgePainter}from'./SmudgePainter'
import{it,expect,vi}from'vitest'
import{textureAlphaExtended}from'../raster/textureAlphaModes'
import{BrushBehaviorPainter}from'./BrushBehaviorPainter'
import{BrushPainter}from'./BrushPainter'
import{pair168}from'../../../../../../packages/shared/src/dualMask168.testFixture'
import{dab157}from'../../../../../../packages/shared/src/particleTimer157.testFixture'
it('independent U8 oracle includes noncommutative roles/zero/full boundaries',()=>{for(const[d,s,expected]of[[128,128,130],[128,192,255],[64,128,0],[64,192,66],[192,64,194],[255,0,255],[0,255,0]]){const D=BigInt(d),S=BigInt(s),raw=3n*D-2n*(255n-S),exact=Number(raw<0n?0n:raw>255n?255n:raw);expect(exact).toBe(expected);expect(Math.round(255*textureAlphaExtended('hardMixSofterPhotoshop',d/255,s/255,1,false))).toBe(expected)}})
it('malformed newmode recorded preparation and actual painter reject before state/leases',()=>{for(const entry of['recorded','paint','erase']){const b=pair168();if(entry!=='erase')b.behavior!.dual!.sampling=undefined;const touched=vi.fn(),state=new Proxy({},{get(){touched();throw Error('owner touched')}});if(entry==='recorded'){const p=Object.create(BrushPainter.prototype)as BrushPainter;expect(()=>p.prepareRecordedStampResources(b)).toThrow('dual168')}else{const p=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter;expect(()=>p.paint(state as any,[dab157()],{sizeMultiplier:1}as any,b,{size:true,opacity:true},[1,0,0],state as any,false,undefined,undefined,entry==='erase')).toThrow('dual168')}expect(touched).not.toHaveBeenCalled()}})

it('new168 never falls back to legacy Smudge per-dab selector',()=>{const p=Object.create(SmudgePainter.prototype)as SmudgePainter,touched=vi.fn(),target=new Proxy({},{get(){touched();throw Error('owner touched')}});expect(()=>p.paint(target as any,[dab157()],'u',undefined,'s',{brush:pair168()}as any)).toThrow('ordinary BrushPainter');expect(touched).not.toHaveBeenCalled()})
