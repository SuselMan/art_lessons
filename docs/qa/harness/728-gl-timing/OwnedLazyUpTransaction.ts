import {WatercolorCanonicalFIFO} from '../../../../apps/web/src/engine/src/watercolor/WatercolorCanonicalFIFO'
/** CPU-only adapter proof. No engine flag, source renderer or GPU copy policy. */
export interface OwnedLazyUpMaterial {
  readonly generation: number
  /** Existing caller owns physical scratch; retention alone does not freeze it. */
  retain(): void
  valid(generation: number): boolean
  /** Must capture old material before any queued successor writes it. */
  capture(): void
  prepare(): Generator<number, void, void>
  publish(): void
  release(lost: boolean): void
}
export type OwnedLazyUpStatus = 'retained'|'captured'|'preparing'|'published'|'cancelled'|'failed'
export function enqueueOwnedLazyUp(queue: WatercolorCanonicalFIFO, material: OwnedLazyUpMaterial) {
  const generation=material.generation
  const result:{status:OwnedLazyUpStatus;error:unknown;releaseError:unknown}={status:'retained',error:null,releaseError:null}
  let released=false,closed=false,running=false
  let work:Generator<number,void,void>|null=null
  const closeWork=()=>{if(work&&!running){const held=work;work=null;held.return(undefined)}}
  const release=(lost:boolean)=>{
    if(released)return
    released=true
    try{material.release(lost)}catch(error){result.releaseError=error;result.status='failed'}
  }
  const check=()=>{if(closed||!material.valid(generation))throw Error('Stale owned lazy UP material generation')}
  material.retain()
  queue.enqueue({
    execute:function*(){
      try{
        check();material.capture();check();result.status='captured'
        result.status='preparing'
        work=material.prepare()
        try{
          for(;;){check();running=true;let step:IteratorResult<number,void>;try{step=work.next()}finally{running=false}check();if(step.done)break;yield step.value}
        }finally{closeWork()}
        check();material.publish();check();result.status='published'
      }catch(error){result.status='failed';result.error=error;throw error}
      finally{closed=true;release(false);if(result.releaseError!==null&&result.error===null){result.error=result.releaseError;throw result.releaseError}}
    },
    cancel:lost=>{closed=true;if(result.status!=='failed'&&result.status!=='published')result.status='cancelled';try{closeWork()}catch(error){result.status='failed';result.error??=error}finally{release(lost)}},
  })
  return result
}
/** Uses the SAME FIFO; input is retained, never silently dropped or early-applied. */
export function enqueueAfterOwnedUp(queue:WatercolorCanonicalFIFO,apply:()=>void,cancel:(lost:boolean)=>void){
 queue.enqueue({execute:function*(){apply()},cancel})
}
