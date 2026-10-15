import {installMiniPuddle as installBase} from './controller-v28'
/** Move first-touch texture allocation into Mini initialization; reuse the existing bounded pool. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const pool=engine._ribbonScratchPool,buffers=[];try{for(let i=0;i<12;i++)buffers.push(pool.acquire(size,size))}finally{for(const b of buffers)pool.release(b)}return installBase(engine,size,mode,onStatus)}
