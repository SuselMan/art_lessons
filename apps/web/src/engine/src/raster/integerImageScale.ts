import { sourceImageScaleAxis } from '../presets/sourceImageScaleAxis'

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
export interface IntegerImageSize { width: number; height: number }
export type IntegerImageInterpolationLaw = 'scalar' | 'simd'

const MAX_SIDE = 4096
const MAX_PIXELS = 4 * 1024 * 1024
export const INTEGER_IMAGE_STREAM_QUANTUM=1024
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
export function assertIntegerImageScaleBudget(sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4 = 1, law: IntegerImageInterpolationLaw = 'simd'): void {
  checkedPlan(sourceSize, destinationSize, channels, law)
}

/** Returns fresh bytes; source bytes and both size objects remain untouched.
 * Rejects inputs requiring more than64M channel samples, rather than silently
 * changing the filter or allowing an unbounded preparation task. */
export function scaleIntegerImageU8(
  source: Uint8Array, sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4 = 1, law: IntegerImageInterpolationLaw = 'simd',
): Uint8Array {
  const sourcePixels = checkedPixels(sourceSize), destinationPixels = checkedPixels(destinationSize)
  if(channels===1){
    if(source.length!==sourcePixels)throw new RangeError('Invalid integer image byte layout')
    const steps=scaleIntegerImageSampledU8(sourceSize,destinationSize,(x,y)=>source[y*sourceSize.width+x],law)
    let finished=false
    try{while(true){const next=steps.next();if(next.done){finished=true;return next.value}}}
    finally{if(!finished)steps.return(new Uint8Array(0))}
  }
  if (channels !== 4 || (law !== 'scalar' && law !== 'simd') || source.length !== sourcePixels * channels) throw new RangeError('Invalid integer image byte layout')
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


/** Same fixed-point kernel over an immutable sampled plane. No source-sized
 * identity/crop/premultiplication buffer. A step yields every 1024 source taps;
 * callers reserve output+axis storage before creating the iterator. */
/** Constant-space axis cursor; arithmetic matches sourceImageScaleAxis exactly.
 * No per-destination arrays or per-tap weight objects are retained. */
interface SampleAxis {source:number;destination:number;up:boolean;increment:number;origin:number;coverage:number}
interface SampleCursor {start:number;length:number;first:number;full:number;packed:number;up:boolean}
function sampledAxis(source:number,destination:number):SampleAxis{
 const up=destination>=source
 return {source,destination,up,increment:Math.floor(source*65536/destination),origin:up?Math.floor(32768*source/destination)-32768:0,coverage:Math.floor((destination*16384+source-1)/source)}
}
function sampledCursor(axis:SampleAxis,index:number,out:SampleCursor):void{
 const value=axis.origin+index*axis.increment,position=Math.floor(value/65536)
 out.start=Math.max(0,position);out.up=axis.up
 if(axis.up){const fraction=Math.floor(value/256);out.packed=position<0||position>=axis.source-1?0:fraction-Math.floor(fraction/256)*256;out.length=out.packed?2:1;out.first=256-out.packed;out.full=0}
 else{const fraction=value-Math.floor(value/65536)*65536;out.full=axis.coverage;out.first=Math.floor((65536-fraction)*axis.coverage/65536);out.packed=0;out.length=1+Math.ceil((16384-out.first)/out.full)}
 if(out.start+out.length>axis.source)throw new RangeError('Integer scaling footprint exceeds its source')
}
const sampledWeight=(axis:SampleCursor,index:number)=>axis.up?(index?axis.packed:axis.first):index?Math.min(axis.full,16384-axis.first-(index-1)*axis.full):axis.first
export function* scaleIntegerImageSampledU8(
 sourceSize:IntegerImageSize,destinationSize:IntegerImageSize,
 read:(x:number,y:number)=>number,law:IntegerImageInterpolationLaw='simd',
 write?:(x:number,y:number,value:number)=>void,
):Generator<void,Uint8Array,void>{
 checkedPixels(sourceSize);const destinationPixels=checkedPixels(destinationSize)
 if(law!=='scalar'&&law!=='simd')throw new RangeError('Invalid integer interpolation law')
 const xAxis=sampledAxis(sourceSize.width,destinationSize.width),yAxis=sampledAxis(sourceSize.height,destinationSize.height)
 const horizontal:SampleCursor={start:0,length:0,first:0,full:0,packed:0,up:false},vertical={...horizontal}
 // Same original MAX64M admission, BEFORE allocating output. Axis scans are
 // <=8192 fixed-metadata operations, never a pixel-sized allocation.
 let xTaps=0,yTaps=0
 for(let x=0;x<destinationSize.width;x++){sampledCursor(xAxis,x,horizontal);xTaps+=horizontal.length}
 for(let y=0;y<destinationSize.height;y++){sampledCursor(yAxis,y,vertical);yTaps+=vertical.length}
 if(xTaps*yTaps>MAX_CHANNEL_SAMPLES)throw new RangeError('Integer image scaling work exceeds the budget')
 const output=new Uint8Array(write?0:destinationPixels);let ticks=0
 const sample=(x:number,y:number)=>{const value=read(x,y);if(!Number.isInteger(value)||value<0||value>255)throw new RangeError('Invalid sampled image byte');return value}
 for(let y=0;y<destinationSize.height;y++){
  sampledCursor(yAxis,y,vertical)
  for(let x=0;x<destinationSize.width;x++){
   sampledCursor(xAxis,x,horizontal);let value=0
   if(xAxis.up&&yAxis.up&&law==='scalar'){
    for(let iy=0;iy<vertical.length;iy++){let row=0;for(let ix=0;ix<horizontal.length;ix++){row+=sample(horizontal.start+ix,vertical.start+iy)*sampledWeight(horizontal,ix);if(++ticks===INTEGER_IMAGE_STREAM_QUANTUM){ticks=0;yield}}value+=Math.floor(row/256)*sampledWeight(vertical,iy)}value=Math.floor(value/256)
   }else if(xAxis.up&&yAxis.up){
    for(let ix=0;ix<horizontal.length;ix++){let column=0;for(let iy=0;iy<vertical.length;iy++){column+=sample(horizontal.start+ix,vertical.start+iy)*sampledWeight(vertical,iy);if(++ticks===INTEGER_IMAGE_STREAM_QUANTUM){ticks=0;yield}}value+=Math.floor(column/256)*sampledWeight(horizontal,ix)}value=Math.floor(value/256)
   }else{
    for(let iy=0;iy<vertical.length;iy++){let row=0;for(let ix=0;ix<horizontal.length;ix++){row+=sample(horizontal.start+ix,vertical.start+iy)*sampledWeight(horizontal,ix);if(++ticks===INTEGER_IMAGE_STREAM_QUANTUM){ticks=0;yield}}if(!xAxis.up&&!yAxis.up)row=Math.floor(row/16);value+=row*sampledWeight(vertical,iy)}value=Math.floor(value/(!xAxis.up&&!yAxis.up?16777216:4194304))
   }
   if(write)write(x,y,value);else output[y*destinationSize.width+x]=value
  }
 }
 return output
}
