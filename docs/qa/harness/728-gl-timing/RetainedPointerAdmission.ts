import type {PointerData} from '../../../../apps/web/src/engine/src/input/PointerInput'
import {WatercolorCanonicalFIFO, type CanonicalWatercolorRequest} from '../../../../apps/web/src/engine/src/watercolor/WatercolorCanonicalFIFO'

/** CPU foundation only: no Engine activation. Adapter must capture ALL material
 * dependencies at actual DOWN; opts-only swapping is explicitly insufficient. */
export interface PointerAdmissionContext {
  readonly strokeId: string
  readonly layerId: string
  readonly generation: number
  readonly opts: Readonly<Record<string, unknown>>
  readonly wet: Readonly<Record<string, unknown>>
}
export interface PointerAdmissionPort {
  valid(context: PointerAdmissionContext): boolean
  /** Synchronous immutable admission scope; restore in finally, including throws. */
  scope<T>(context: PointerAdmissionContext, dispatch: () => T): T
  start(sample: PointerData): void
  move(sample: PointerData): void
  end(sample: PointerData): void
}
export type AdmissionStatus = 'retained'|'dispatched'|'cancelled'|'failed'
/** No predicted-sample API. Each accepted normalized sample is copied at receipt.
 * Full gesture is dispatched only after predecessor publication AND actual UP.
 * This deliberately does not promise reduced next-pigment latency. */
export function retainPointerAdmission(queue: WatercolorCanonicalFIFO, context: PointerAdmissionContext, down: PointerData, port: PointerAdmissionPort, capacity = 4096) {
  if (!Number.isSafeInteger(capacity) || capacity < 2) throw Error('Invalid pointer admission capacity')
  if (!context.strokeId || !context.layerId) throw Error('Missing pointer admission identity')
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw Error('Admission requires plain immutable material data')
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  const packet: PointerAdmissionContext = structuredClone(context)
  freeze(packet)
  const copy = (sample: PointerData): PointerData => Object.freeze({...sample})
  const samples: Array<{kind:'start'|'move'|'end'; sample:PointerData}> = [{kind:'start',sample:copy(down)}]
  const result:{status:AdmissionStatus;error:unknown;acceptedSamples:number}={status:'retained',error:null,acceptedSamples:1}
  let ended=false,closed=false
  const fail=(error:unknown)=>{closed=true;result.status='failed';result.error=error;samples.length=0}
  const request: CanonicalWatercolorRequest={
    execute:function*(){
      try {
        while(!ended){if(closed)throw result.error??Error('Cancelled pointer admission');if(!port.valid(packet))throw Error('Stale pointer admission');yield 0}
        if(closed||!port.valid(packet))throw result.error??Error('Stale pointer admission')
        port.scope(packet,()=>{
          for(const item of samples){if(closed||!port.valid(packet))throw Error('Invalidated pointer admission');port[item.kind](item.sample)}
        })
        if(closed||!port.valid(packet))throw Error('Invalidated pointer admission after dispatch')
        result.status='dispatched';closed=true;samples.length=0
      }catch(error){fail(error);throw error}
    },
    cancel:()=>{closed=true;samples.length=0;if(result.status==='retained')result.status='cancelled'},
  }
  const append=(kind:'move'|'end',sample:PointerData)=>{
    if(closed||ended)throw result.error??Error('Pointer admission closed')
    if(samples.length===capacity){const error=Error('Pointer admission capacity exceeded: entire gesture rejected');fail(error);queue.cancelUnstarted(request);throw error}
    samples.push({kind,sample:copy(sample)});result.acceptedSamples++;ended=kind==='end'
  }
  try{queue.enqueue(request)}catch(error){if(queue.cancelUnstarted(request))fail(error);else result.error=error;throw error}
  return {result,move:(sample:PointerData)=>append('move',sample),end:(sample:PointerData)=>append('end',sample),cancel(){if(!queue.cancelUnstarted(request)){closed=true;samples.length=0;if(result.status==='retained')result.status='cancelled'}}}
}
