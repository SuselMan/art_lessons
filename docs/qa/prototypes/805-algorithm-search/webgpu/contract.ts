// Standard WebGPU bit constants; local names avoid partial DOM typings in TS6.
export const BUFFER={MAP_READ:0x0001,COPY_SRC:0x0004,COPY_DST:0x0008,UNIFORM:0x0040,STORAGE:0x0080} as const
/** Research-only: dense top-left rows, premultiplied RGBA8, scalar water/paper. */
export type {AlgorithmInput as Input} from '../protocol'
import type {AlgorithmInput as Input} from '../protocol'
export type Output = {buffer:GPUBuffer;width:number;height:number;bytesPerRow:number}
export interface Candidate {
  readonly metadata:Readonly<Record<string,unknown>>
  /** Upload and GPU completion are excluded from run timing. Re-upload resets repeats. */
  upload(input:Input):Promise<void>
  /** Submit only. Caller MUST await device.queue.onSubmittedWorkDone for completion. */
  run():Output
  /** Separate copy/map, excluded from compute completion time. */
  readback():Promise<Uint8Array>
  destroy():void
}
export function validateInput(input:Input,size:number){
  if(input.size!==size||!Number.isInteger(input.seed)||input.seed<0||input.seed>0xffffffff)throw Error('Invalid size/seed')
  for(const [array,length] of [[input.rgba,size*size*4],[input.water,size*size],[input.paper,size*size]] as const)
    if(!(array instanceof Uint8Array)||array.length!==length)throw Error('Invalid input byte length/type')
  for(let i=0;i<input.rgba.length;i+=4)for(let k=0;k<3;k++)if(input.rgba[i+k]>input.rgba[i+3])throw Error('Input must be premultiplied RGBA8')
}
export function validateSize(size:number){if(!Number.isInteger(size)||size<64||size>2048||size%64)throw Error('Size must be 64..2048, multiple of64 (aligned dense output rows)')}
export function integerOption(value:number,min:number,max:number,name:string){if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid '+name);return value}
export async function pipeline(device:GPUDevice,code:string,label:string){
  const module=device.createShaderModule({code,label})
  const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error')
  if(errors.length)throw Error(label+': '+errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'))
  return device.createComputePipelineAsync({label,layout:'auto',compute:{module,entryPoint:'main'}})
}
export function buffer(device:GPUDevice,size:number,usage:number,label:string){return device.createBuffer({size,usage,label})}
export function packedRGBA(bytes:Uint8Array){const out=new Uint32Array(bytes.length/4);for(let i=0;i<out.length;i++){const j=i*4;out[i]=(bytes[j]|bytes[j+1]<<8|bytes[j+2]<<16|bytes[j+3]<<24)>>>0}return out}
export async function readPacked(device:GPUDevice,source:GPUBuffer,size:number,staging:GPUBuffer){
  const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(source,0,staging,0,size*size*4);device.queue.submit([encoder.finish()])
  await staging.mapAsync(1 /* GPUMapMode.READ */)
  try{return new Uint8Array(staging.getMappedRange()).slice()}finally{staging.unmap()}
}
