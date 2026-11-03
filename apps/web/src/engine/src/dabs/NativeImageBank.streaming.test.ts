import {CanonicalMaskSourceBank,type CanonicalMaskSourceInput} from './CanonicalMaskSourceBank'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import type {BrushTip,TipMaskId} from '@grafetto/shared'
import {expect,it,vi} from 'vitest'
import {sourceImageScaleAxis} from '../presets/sourceImageScaleAxis'
import {scaleIntegerImageSampledU8} from '../raster/integerImageScale'
import {nativeImageBankFromRect,nativeImagePixels,nativeImageRgbaSteps,nativeImageStreamingTransientBytes,type NativeImageResource} from './NativeImageBank'
import {BrushPreparation,brushPreparationSteps} from './BrushPreparation'
const oldIntegerScale=(()=>{

/** Deterministic U8 image scaling for a precomputed integer destination grid.
 * Independent arithmetic implementation of the behavior documented by Qt
 * 5.15.13 QImage::smoothScaled/qimagescale (SSE2/NEON interpolation order).
 * See https://code.qt.io/cgit/qt/qtbase.git/tree/src/gui/painting/qimagescale.cpp?h=v5.15.13-lts-lgpl
 * and qdrawhelper_p.h. No Qt implementation code is included here.
 *
 * One channel is an opaque grayscale intensity, not an inverted coverage mask.
 * Four channels must already be premultiplied RGBA. No colorspace conversion,
 * premultiplication, border, aspect fitting or QPainter transform occurs here.
 * The older generic Qt up/up fallback has a different rounding order; this
 * function never selects behavior from the executing CPU; default SIMD preserves
 * existing outputs and an explicit scalar law supports native source conformance.
 */
interface IntegerImageSize { width: number; height: number }
type IntegerImageInterpolationLaw = 'scalar' | 'simd'

const MAX_SIDE = 4096
const MAX_PIXELS = 4 * 1024 * 1024
const MAX_CHANNEL_SAMPLES = 64 * 1024 * 1024
const AREA_UNIT = 16384

interface AxisSample { start: number; weights: number[] }
interface ScaleAxis { shrinking: boolean; samples: AxisSample[]; taps: number }

function checkedPixels(size: IntegerImageSize): number {
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)
    || size.width < 1 || size.height < 1 || size.width > MAX_SIDE || size.height > MAX_SIDE
    || size.width * size.height > MAX_PIXELS) throw new RangeError('Integer image dimensions exceed the scaling budget')
  return size.width * size.height
}

/** Fixed-point center positions for enlargement, footprint starts for reduction. */
function scaleAxis(source: number, destination: number): ScaleAxis {
  const axis = sourceImageScaleAxis(source, destination), shrinking = !axis.up
  const samples: AxisSample[] = []
  let taps = 0
  for (let i = 0; i < destination; i++) {
    const start = axis.positions[i], packed = axis.weights[i]
    let weights: number[]
    if (shrinking) {
      const fullWeight = Math.floor(packed / 65536), first = packed % 65536
      weights = [first]
      let remaining = AREA_UNIT - first
      while (remaining > 0) {
        const weight = Math.min(fullWeight, remaining)
        weights.push(weight)
        remaining -= weight
      }
    } else weights = packed ? [256 - packed, packed] : [256]
    if (start + weights.length > source) throw new RangeError('Integer scaling footprint exceeds its source')
    taps += weights.length
    samples.push({ start, weights })
  }
  return { shrinking, samples, taps }
}

function checkedPlan(sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4, law: IntegerImageInterpolationLaw): { xAxis: ScaleAxis; yAxis: ScaleAxis } {
  checkedPixels(sourceSize)
  checkedPixels(destinationSize)
  if ((channels !== 1 && channels !== 4) || (law !== 'scalar' && law !== 'simd')) throw new RangeError('Invalid integer scaling channel count or interpolation law')
  const xAxis = scaleAxis(sourceSize.width, destinationSize.width)
  const yAxis = scaleAxis(sourceSize.height, destinationSize.height)
  if (xAxis.taps * yAxis.taps * channels > MAX_CHANNEL_SAMPLES) throw new RangeError('Integer image scaling work exceeds the budget')
  return { xAxis, yAxis }
}

/** Shared admission for wrappers which must allocate/convert their source pixels
 * before invoking the kernel. Does not allocate any image-sized pixel buffer. */


/** Returns fresh bytes; source bytes and both size objects remain untouched.
 * Rejects inputs requiring more than64M channel samples, rather than silently
 * changing the filter or allowing an unbounded preparation task. */
function scaleIntegerImageU8(
  source: Uint8Array, sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4 = 1, law: IntegerImageInterpolationLaw = 'simd',
): Uint8Array {
  const sourcePixels = checkedPixels(sourceSize), destinationPixels = checkedPixels(destinationSize)
  if ((channels !== 1 && channels !== 4) || (law !== 'scalar' && law !== 'simd') || source.length !== sourcePixels * channels) throw new RangeError('Invalid integer image byte layout')
  if (sourceSize.width === destinationSize.width && sourceSize.height === destinationSize.height) return new Uint8Array(source)
  const { xAxis, yAxis } = checkedPlan(sourceSize, destinationSize, channels, law)
  const output = new Uint8Array(destinationPixels * channels)
  for (let y = 0; y < destinationSize.height; y++) {
    const vertical = yAxis.samples[y]
    for (let x = 0; x < destinationSize.width; x++) {
      const horizontal = xAxis.samples[x]
      for (let channel = 0; channel < channels; channel++) {
        let value = 0
        if (!xAxis.shrinking && !yAxis.shrinking && law === 'scalar') {
          for (let iy = 0; iy < vertical.weights.length; iy++) {
            let row = 0
            for (let ix = 0; ix < horizontal.weights.length; ix++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              row += source[offset] * horizontal.weights[ix]
            }
            value += Math.floor(row / 256) * vertical.weights[iy]
          }
          value = Math.floor(value / 256)
        } else if (!xAxis.shrinking && !yAxis.shrinking) {
          // SIMD Qt interpolates vertically first, truncating before X.
          for (let ix = 0; ix < horizontal.weights.length; ix++) {
            let column = 0
            for (let iy = 0; iy < vertical.weights.length; iy++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              column += source[offset] * vertical.weights[iy]
            }
            value += Math.floor(column / 256) * horizontal.weights[ix]
          }
          value = Math.floor(value / 256)
        } else {
          for (let iy = 0; iy < vertical.weights.length; iy++) {
            let row = 0
            for (let ix = 0; ix < horizontal.weights.length; ix++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              row += source[offset] * horizontal.weights[ix]
            }
            // Keep integer precision through the first reduction. Arithmetic
            // division avoids JS signed32 overflow in the second-axis sum.
            if (xAxis.shrinking && yAxis.shrinking) row = Math.floor(row / 16)
            value += row * vertical.weights[iy]
          }
          value = Math.floor(value / (xAxis.shrinking && yAxis.shrinking ? 16777216 : 4194304))
        }
        output[(y * destinationSize.width + x) * channels + channel] = value
      }
    }
  }
  return output
}

return scaleIntegerImageU8
})()

function drain<T>(steps:Generator<void,T,void>):{value:T;quanta:number}{let quanta=0;while(true){const n=steps.next();if(n.done)return{value:n.value,quanta};quanta++}}
function oldPixels(resource:NativeImageResource,alpha:Uint8Array,channels?:readonly Uint8Array[]){
 const side=Math.sqrt(alpha.length),r=resource.rect,size={width:resource.nativeWidth,height:resource.nativeHeight},crop=new Uint8Array(r.width*r.height)
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)crop[y*r.width+x]=alpha[(r.y+y)*side+r.x+x]
 const rgba=new Uint8Array(resource.width*resource.height*4)
 if(!channels){const brightness=new Uint8Array(crop);for(let i=0;i<brightness.length;i++)brightness[i]=255-brightness[i];const scaled=oldIntegerScale(brightness,r,size);for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){const i=((y+1)*resource.width+x+1)*4;rgba[i]=rgba[i+1]=rgba[i+2]=scaled[y*size.width+x];rgba[i+3]=255};return rgba}
 const a=oldIntegerScale(crop,r,size)
 for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++)rgba[((y+1)*resource.width+x+1)*4+3]=a[y*size.width+x]
 for(let c=0;c<channels.length;c++){const pm=new Uint8Array(crop.length);for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const i=y*r.width+x;pm[i]=Math.floor(channels[c][(r.y+y)*side+r.x+x]*crop[i]/255+.5)}const level=oldIntegerScale(pm,r,size);for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){const i=y*size.width+x,v=a[i]?Math.min(255,Math.floor(level[i]*255/a[i]+.5)):0,at=((y+1)*resource.width+x+1)*4;if(channels.length===1)rgba[at]=rgba[at+1]=rgba[at+2]=v;else rgba[at+c]=v}}
 return rgba
}
it('streamed cropped scalar/lightness/RGB levels are byte-identical to frozen pre-streaming integer arithmetic',()=>{
 for(const [side,x,y,width,height]of [[16,1,2,7,9],[32,3,4,25,17],[64,7,5,47,51]]){
  const alpha=Uint8Array.from({length:side*side},(_,i)=>(i*73+(i%7)*19)%256),channels=[13,47,101].map(k=>Uint8Array.from(alpha,(_,i)=>(i*k+33)%256))
  const originals=[alpha,...channels].map(p=>new Uint8Array(p))
  for(const resource of nativeImageBankFromRect(`asset:${'1'.repeat(64)}`,{x,y,width,height}))for(const planes of [undefined,channels.slice(0,1),channels]){
   const actual=drain(nativeImageRgbaSteps(resource,alpha,planes)).value,expected=oldPixels(resource,alpha,planes);expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
  }
  expect([alpha,...channels].every((plane,i)=>Buffer.from(plane).equals(Buffer.from(originals[i])))).toBe(true)
 }
})
it('sampled scalar SIMD/scalar kernels retain all resize branches and yield at most64 source reads',()=>{
 for(const law of ['scalar','simd']as const)for(const [w,h]of [[3,5],[13,5],[3,17],[13,17],[7,9]]){
  const source=Uint8Array.from({length:63},(_,i)=>(i*43)%256);let reads=0,last=0
  const iterator=scaleIntegerImageSampledU8({width:7,height:9},{width:w,height:h},(x,y)=>{reads++;return source[y*7+x]},law)
  while(true){const n=iterator.next();expect(reads-last).toBeLessThanOrEqual(64);last=reads;if(n.done){expect(n.value).toEqual(oldIntegerScale(source,{width:7,height:9},{width:w,height:h},1,law));break}}
 }
})
it('Leaves1000crop and pairedRock511crop fit their genuine streamed output/axis peak without fullcrop copies',()=>{
 for(const [side,crop,channels]of [[1024,1000,0],[512,511,1]]){
  const alpha=Uint8Array.from({length:side*side},(_,i)=>i%256),planes=channels?[Uint8Array.from(alpha,v=>255-v)]:undefined
  const resource=nativeImageBankFromRect(`asset:${'2'.repeat(64)}`,{x:side===1024?12:0,y:side===1024?12:0,width:crop,height:crop}).find(r=>r.nativeWidth>=24&&r.nativeWidth<48)!
  expect(resource).toBeDefined()
  const result=drain(nativeImageRgbaSteps(resource,alpha,planes))
  expect(result.quanta).toBeGreaterThan(1000);expect(result.value.length).toBe(resource.width*resource.height*4)
  const peak=nativeImageStreamingTransientBytes(resource,!!planes),retainedBaseline=side===1024?1302160:1141232,sourceStage=side*side
  expect(retainedBaseline+sourceStage+peak+128*1024).toBeLessThan(4*1024*1024)
  // Pixel-sized allocations are bounded by destination only: outputRGBA,
  // retained alpha and ONE serial channel; axismetadata covered independently.
  expect(peak).toBeGreaterThanOrEqual(result.value.byteLength+(planes?2*resource.nativeWidth*resource.nativeHeight:0))
 }
})
it('cooperative preparation drains multiple64tap quanta inside4ms and closes the iterator BEFORE finalizer on cancel',async()=>{
 const callbacks=new Map<number,FrameRequestCallback>();let token=0,now=0,closed=false,nextCalls=0,finalized=false
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{callbacks.set(++token,cb);return token});vi.stubGlobal('cancelAnimationFrame',(id:number)=>callbacks.delete(id));const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 const preparation=new BrushPreparation(),abort=new AbortController()
 function* work(){try{for(let i=0;i<1000;i++){nextCalls++;now+=.1;yield}}finally{closed=true}}
 try{const result=preparation.run([()=>brushPreparationSteps(work())],{signal:abort.signal},()=>true,'stream',()=>{expect(closed).toBe(true);finalized=true});const first=callbacks.values().next().value!;callbacks.clear();first(0);expect(nextCalls).toBeGreaterThan(1);expect(nextCalls).toBeLessThanOrEqual(41);abort.abort();expect(await result).toEqual({status:'cancelled'});expect(finalized).toBe(true);expect(callbacks.size).toBe(0)}finally{preparation.cancel();clock.mockRestore();vi.unstubAllGlobals()}
})

function bankMockGL() {
  let id = 0, bound: any = null, unpack = 8
  const images = new Map<object, Uint8Array>(), filters = new Map<object, Map<number, number>>()
  const gl: any = { MAX_TEXTURE_SIZE: 1, TEXTURE_2D: 2, TEXTURE_BINDING_2D: 3, ACTIVE_TEXTURE: 4,
    UNPACK_ALIGNMENT: 5, RGBA: 6, LUMINANCE_ALPHA: 7, UNSIGNED_BYTE: 8, CLAMP_TO_EDGE: 9,
    NEAREST: 10, LINEAR: 11, TEXTURE_MIN_FILTER: 12, TEXTURE_MAG_FILTER: 13, TEXTURE_WRAP_S: 14, TEXTURE_WRAP_T: 15 }
  gl.NO_ERROR=0;gl.getError=()=>0;gl.isContextLost=()=>false
  gl.createTexture = vi.fn(() => ({ id: ++id }))
  gl.deleteTexture = vi.fn((texture: object) => images.delete(texture))
  gl.getParameter = (name: number) => name === gl.MAX_TEXTURE_SIZE ? 16384 : name === gl.TEXTURE_BINDING_2D ? bound : name === gl.UNPACK_ALIGNMENT ? unpack : 100
  gl.activeTexture = vi.fn()
  gl.bindTexture = (_: number, texture: object | null) => { bound = texture }
  gl.pixelStorei = (_: number, value: number) => { unpack = value }
  gl.texParameteri = (_: number, name: number, value: number) => { let values = filters.get(bound); if (!values) { values = new Map(); filters.set(bound, values) }; values.set(name, value) }
  gl.texImage2D = vi.fn((...args: any[]) => { images.set(bound, new Uint8Array(args[8])) })
  return { gl, images, filters }
}
function bankInput(width = 3, height = 5, gray?: readonly number[]): CanonicalMaskSourceInput {
  const assetSide = Math.max(width, height) + 2, bytes = new Uint8Array(assetSide * assetSide)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes[(y + 1) * assetSide + x + 1] = 255 - (gray?.[y * width + x] ?? ((x * 83 + y * 54) % 256))
  const id = 'chalk' as TipMaskId
  const tip: BrushTip = { kind: 'bitmap', mask: id, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed', imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 1, y: 1, width, height } } }
  return { id, tip, assetSide, readOriginalCoverage: vi.fn(() => bytes) }
}
function bankFixture(source = bankInput(), gpu = 16 * 1024 * 1024, cpuBytes = 4 * 1024 * 1024) {
  const state = bankMockGL(), cache = new BrushTextureCache(state.gl, gpu), cpu = new BrushMipCache(cpuBytes)
  const bank = new CanonicalMaskSourceBank(state.gl, cache, cpu, [source], { gpuBytes: 0, cpuBytes: 0 })
  return { ...state, cache, cpu, bank, source }
}

it('streamed mask RGBA retains the old Bank two-inversion law for black, white and asymmetric actual uploads',()=>{
 for(const gray of [[0,0,0,0],[255,255,255,255],[0,255,37,149]]){
  const s=bankFixture(bankInput(2,2,gray))
  try{const index=s.bank.jobs.findIndex(j=>j.kind==='native-image'&&j.resource.scale===1);s.bank.prepareJob(index);const pixels=s.images.get(s.cache.get(s.bank.jobs[index].key)!)!;expect([pixels[20],pixels[24],pixels[36],pixels[40]]).toEqual(gray)}finally{s.bank.reset();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
 }
})
it.each(['read-undefined','cancel','invalidated','upload-fault']as const)('streamed Bank %s closes CPU/GPU ownership without partial publication',mode=>{
 const source=bankInput(31,29),s=bankFixture(source),abort=new AbortController(),failure=Error('upload failed')
 if(mode==='read-undefined')vi.mocked(source.readOriginalCoverage).mockImplementation(()=>{throw undefined})
 if(mode==='upload-fault')s.gl.texImage2D.mockImplementation(()=>{throw failure})
 const index=s.bank.jobs.findIndex(j=>j.kind==='native-image'&&j.resource.scale===.5),steps=s.bank.prepareJobSteps(index,abort.signal)
 let caught=false,value:unknown='unset'
 try{
  try{
   if(mode==='read-undefined'||mode==='upload-fault')drain(steps)
   else{expect(steps.next().done).toBe(false);expect(s.gl.createTexture).not.toHaveBeenCalled();if(mode==='cancel'){abort.abort();expect(steps.next()).toEqual({done:true,value:'cancelled'})}else{s.bank.reset();expect(steps.next()).toEqual({done:true,value:'cancelled'})}}
  }catch(error){caught=true;value=error}
  if(mode==='read-undefined'){expect(caught).toBe(true);expect(value).toBeUndefined()}
  if(mode==='upload-fault'){expect(caught).toBe(true);expect(value).toBe(failure);expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1)}
  expect(s.cache.bytes).toBe(0);expect(s.bank.isReady()).toBe(false)
 }finally{steps.return('cancelled');s.bank.reset();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})
it('reentrant cancellation inside active next closes before finalizer and retains thrown undefined priority',async()=>{
 let callback:FrameRequestCallback|undefined,closed=false,finalized=false,caught=false,value:unknown='unset'
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{callback=cb;return 1});vi.stubGlobal('cancelAnimationFrame',()=>{})
 const preparation=new BrushPreparation(),abort=new AbortController()
 function* work(){try{abort.abort();throw undefined;yield}finally{closed=true}}
 try{
  const result=preparation.run([()=>brushPreparationSteps(work())],{signal:abort.signal},()=>true,'reentrant',outcome=>{expect(closed).toBe(true);expect('error'in outcome).toBe(true);finalized=true}).catch(error=>{caught=true;value=error})
  callback!(0);await result;expect(caught).toBe(true);expect(value).toBeUndefined();expect(finalized).toBe(true)
 }finally{preparation.cancel();vi.unstubAllGlobals()}
})

it.each(['short-original','short-channel','wrong-count','undefined-channels','retire-original']as const)('streamed paired original readers reject %s before any GPU work',mode=>{
 const {gl}=bankMockGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache(),bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency')
 const asset={id:`asset:${'8'.repeat(64)}`,size:16,x:1,y:1,width:4,height:4},channels=[0,1,2].map(i=>({...asset,id:`asset:${String(i+3).repeat(64)}`})),readChannels=vi.fn(()=>mode==='wrong-count'?[new Uint8Array(256)]:mode==='short-channel'?channels.map(()=>new Uint8Array(16)):channels.map(()=>new Uint8Array(256)))
 if(mode==='undefined-channels'){
  // @ts-expect-error deliberate invalid runtime provider result
  readChannels.mockReturnValue(undefined)
 }
 const root=bank.prepareRoot([{kind:'image-material-rgba8',asset,material:'color-stamp-v1',channels,readOriginalCoverage:()=>{if(mode==='retire-original')bank.reset();return new Uint8Array(mode==='short-original'?16:256)},readOriginalChannels:readChannels}],{gpuBytes:0,cpuBytes:0})
 const steps=root.prepareJobSteps(0)
 try{
  if(mode==='retire-original'){expect(drain(steps).value).toBe('cancelled');expect(readChannels).not.toHaveBeenCalled()}
  else expect(()=>drain(steps)).toThrow(/layout/)
  expect(gl.createTexture).not.toHaveBeenCalled()
 }finally{steps.return('cancelled');root.cancel();bank.reset();expect(cpu.reservedBytes).toBe(0);expect(cache.bytes).toBe(0)}
})

it('constant-space sampled axis reproduces all small axis pairs and odd large first/last boundaries',()=>{
 for(let source=1;source<=24;source++)for(let target=1;target<=24;target++){
  const bytes=Uint8Array.from({length:source},(_,i)=>(i*71+source*13)%256)
  const actual=drain(scaleIntegerImageSampledU8({width:source,height:1},{width:target,height:1},x=>bytes[x])).value
  expect(Buffer.from(actual).equals(Buffer.from(oldIntegerScale(bytes,{width:source,height:1},{width:target,height:1})))).toBe(true)
 }
 for(const [source,target]of [[1000,31],[511,32],[153,1224],[4095,2047],[4096,3]]){
  const bytes=Uint8Array.from({length:source},(_,i)=>(i*97)%256),actual=drain(scaleIntegerImageSampledU8({width:source,height:1},{width:target,height:1},x=>bytes[x])).value
  expect(Buffer.from(actual).equals(Buffer.from(oldIntegerScale(bytes,{width:source,height:1},{width:target,height:1})))).toBe(true)
 }
})

it('legacy synchronous L8 public consumer retains zero border without temporaryRGBA or changed interior bytes',()=>{
 const original=Uint8Array.from({length:32*32},(_,i)=>(i*73)%256)
 for(const resource of nativeImageBankFromRect(`asset:${'9'.repeat(64)}`,{x:2,y:3,width:17,height:19})){
  const scalar=nativeImagePixels(resource,original),rgba=oldPixels(resource,original)
  expect(scalar.byteLength).toBe(resource.width*resource.height)
  for(let y=0;y<resource.height;y++)for(let x=0;x<resource.width;x++){const i=y*resource.width+x;expect(scalar[i]).toBe(x===0||y===0||x===resource.width-1||y===resource.height-1?0:255-rgba[i*4])}
 }
})
it('real reduced peak admits previously overbudget200x64 enlargement while preserving CPU4Mi bound at upload',()=>{
 const source=bankInput(200,64),state=bankMockGL(),cache=new BrushTextureCache(state.gl),cpu=new BrushMipCache(),bank=new CanonicalMaskSourceBank(state.gl,cache,cpu,[source],{gpuBytes:692224,cpuBytes:692224}),s={...state,cache,cpu,bank},resource=bank.jobs.find(j=>j.kind==='native-image'&&j.resource.scale===8)!,index=bank.jobs.indexOf(resource)
 const original=s.gl.texImage2D.getMockImplementation()
 s.gl.texImage2D.mockImplementation((...args:unknown[])=>{expect(s.cpu.reservedBytes+s.cpu.bytes).toBeLessThanOrEqual(s.cpu.budgetBytes);return original(...args)})
 try{expect(s.bank.prepareJob(index)).toBe('ready');expect(s.cpu.budgetBytes).toBe(4*1024*1024)}finally{s.bank.reset();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})
