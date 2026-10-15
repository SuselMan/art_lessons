import {installMiniPuddle as installBase} from './controller-v25'
import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
/** Compile the existing lazy plainAdd program before the first real source film. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const source=new AccumulationBuffer(engine.gl,2,2),target=new AccumulationBuffer(engine.gl,2,2);try{source.clear();engine._watercolorPasses.fieldOp(target,source,source,1,1)}finally{source.destroy();target.destroy()}return installBase(engine,size,mode,onStatus)}
