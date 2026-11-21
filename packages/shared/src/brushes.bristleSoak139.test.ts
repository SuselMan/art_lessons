import{it,expect,vi}from'vitest'
import{isBrushLibrary,hasBristleSoak139Scope,hasBristleSoakBeginIdentity139,brushRequiresSourceInputs}from'./index.js'
import{library139}from'./bristleSoak139.testFixture.js'
it('tilt-rotated Soak is restricted to its own versioned capability',()=>{const l=library139(),d=l.brushes[0].descriptor;d.version=205;d.behavior!.dynamics={angle:{control:'tiltDirection',minimum:0,jitter:0,curve:[[0,0],[1,1]]}};expect(hasBristleSoak139Scope(d)).toBe(true);expect(isBrushLibrary(l)).toBe(true);d.version=139;expect(isBrushLibrary(l)).toBe(false);d.version=205;d.behavior!.dynamics.angle!.control='pressure';expect(isBrushLibrary(l)).toBe(false)})
it('whole139 source capability keeps initialization coordinates independent of size and both alpha policies',()=>{
 for(const useOpacity of[false,true])for(const aa of[false,true])for(const compositing of[false,true]){
 const l=library139(),d=l.brushes[0].descriptor,h=d.bristle!;if(h.version!==2)throw Error('fixture');h.ink.useOpacity=useOpacity;h.antialias=aa;h.compositing=compositing
 expect(isBrushLibrary(l)).toBe(true);expect(hasBristleSoak139Scope(d)).toBe(true);expect(brushRequiresSourceInputs(d)).toBe(false)
 expect(h.hairs.map(a=>a.slice(0,2).map(v=>v*h.soak!.initialSide))).toEqual([[-2,0],[1,-1]])
 }
})
it('whole library rejects unresolved lookup, child, malformed metadata and incompatible families',()=>{
 for(const c of['downgrade','sideZero','side257','sideFloat','sideBool','hairGrid','hairBounds','hairNaN','unknown','policy','noInk','lookup','wash','timer','erase','dual','child','foreign','fan','pigment','flow']){
 const l=library139(),d=l.brushes[0].descriptor,h=d.bristle!;if(h.version!==2)throw Error('fixture')
 if(c==='downgrade')d.version=138
 else if(c==='sideZero')h.soak!.initialSide=0
 else if(c==='side257')h.soak!.initialSide=257
 else if(c==='sideFloat')h.soak!.initialSide=3.5
 else if(c==='sideBool')Reflect.set(h.soak!,'initialSide',true)
 else if(c==='hairGrid')h.hairs[0][0]=-.13
 else if(c==='hairBounds')h.hairs[0][0]=.5
 else if(c==='hairNaN')h.hairs[0][1]=NaN
 else if(c==='unknown')Reflect.set(h.soak!,'extra',true)
 else if(c==='policy')Reflect.set(h.soak!,'sourcePolicy','current')
 else if(c==='noInk')Reflect.set(h,'version',1)
 else if(c==='lookup')h.ink.useSaturation=true
 else if(c==='wash')d.behavior!.rendering!.accumulation='alphaDarken'
 else if(c==='timer')d.behavior!.timing={version:1,rate:1,ignoreDistanceSpacing:false}
 else if(c==='erase')d.behavior!.erase=true
 else if(c==='dual')Reflect.set(d.behavior!,'dual',{})
 else if(c==='child'){const child=structuredClone(d);delete d.bristle;d.version=27;d.behavior!.dual={brush:child,sampling:'independent',blendMode:'subtract'}}
 else if(c==='foreign')Reflect.set(d,'grid',{})
 else if(c==='fan')Reflect.set(d.behavior!,'strokeInput',{version:1,initialDirection:'cursorHistory',fanCorners:{}})
 else if(c==='pigment')Reflect.set(d,'colorAdjustment',{})
 else d.flow=.5
 expect(isBrushLibrary(l),c).toBe(false)
 }
})
it('old72 retains no-source capability; saturation93 still needs issued CAS; arbitrary higher versions do not imply soak',()=>{
 const l=library139(),d=l.brushes[0].descriptor,h=d.bristle!;if(h.version!==2)throw Error('fixture');delete h.soak;d.version=72
 expect(isBrushLibrary(l)).toBe(true);expect(hasBristleSoak139Scope(d)).toBe(false);d.version=139;expect(hasBristleSoak139Scope(d)).toBe(false)
 h.ink.useSaturation=true;expect(isBrushLibrary(l)).toBe(false)
})
it('BEGIN identity is mandatory without invented scalar/time/random channels',()=>{
 expect(hasBristleSoakBeginIdentity139({type:'stroke',strokeId:'x'})).toBe(true)
 for(const id of[undefined,null,'',139,[],{},'x'.repeat(201)])expect(hasBristleSoakBeginIdentity139({type:'stroke',strokeId:id})).toBe(false)
 expect(hasBristleSoakBeginIdentity139({type:'stroke',strokeId:'x'.repeat(200)})).toBe(true)
 expect(hasBristleSoakBeginIdentity139({type:'layer_add',strokeId:'x'})).toBe(false)
})

it('saturation metadata never substitutes for trusted CAS lookup resolution',()=>{const l=library139(),h=l.brushes[0].descriptor.bristle!;if(h.version!==2)throw Error('fixture');h.ink.useSaturation=true;h.saturationLookup={version:1,encoding:'bristle-saturation-functional-v1-le',asset:'asset:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',profileSha256:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',byteLength:64};expect(hasBristleSoak139Scope(l.brushes[0].descriptor)).toBe(true);expect(isBrushLibrary(l)).toBe(false)})

const freezeData=(value:object):void=>{for(const child of Object.values(value))if(child&&typeof child==='object')freezeData(child);Object.freeze(value)}
it('revalidates mutable and shallow-frozen descriptors after nested mutation',()=>{
 for(const shallow of[false,true]){
  const d=library139().brushes[0].descriptor,h=d.bristle!;if(h.version!==2)throw Error('fixture')
  if(shallow)Object.freeze(d)
  expect(hasBristleSoak139Scope(d)).toBe(true)
  h.hairs[0][0]=-.13;expect(hasBristleSoak139Scope(d)).toBe(false)
  h.hairs[0][0]=-.5;expect(hasBristleSoak139Scope(d)).toBe(true)
  h.ink.depletion=[NaN];expect(hasBristleSoak139Scope(d)).toBe(false)
 }
})
it('reuses successful deeply frozen canonical validation without rescanning hair arrays',()=>{
 const d=library139().brushes[0].descriptor;freezeData(d)
 const scan=vi.spyOn(Array.prototype,'every')
 try{
  const first=hasBristleSoak139Scope(d),scans=scan.mock.calls.length;scan.mockClear()
  const second=hasBristleSoak139Scope(d),repeatScans=scan.mock.calls.length
  expect(first).toBe(true);expect(scans).toBeGreaterThan(0);expect(second).toBe(true);expect(repeatScans).toBe(0)
 }finally{scan.mockRestore()}
})
it('does not cache a frozen descriptor whose accessor can change its effective scope',()=>{
 const d=library139().brushes[0].descriptor;let flow=1
 Object.defineProperty(d,'flow',{enumerable:true,configurable:true,get:()=>flow});freezeData(d)
 expect(hasBristleSoak139Scope(d)).toBe(true)
 flow=.5;expect(hasBristleSoak139Scope(d)).toBe(false)
})
