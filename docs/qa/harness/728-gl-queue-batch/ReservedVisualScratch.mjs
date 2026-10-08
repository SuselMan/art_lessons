/** Two physical nearest scratch buffers reserved before input; canonical pool cannot steal them. */
export class ReservedVisualScratch{
 constructor(port,excluded,budgetBytes){this.port=port;this.fields=[];this.free=[];this.leased=new Set();this.disposed=false;this.bytes=8*1024*1024;if(!Number.isSafeInteger(budgetBytes)||budgetBytes<this.bytes)throw Error('Explicit8MiB visual scratch budget required');const identities=new Set(excluded);try{for(let i=0;i<2;i++){const f=port.acquire(1024,1024);this.fields.push(f);if(f.width!==1024||f.height!==1024||identities.has(f.texture))throw Error('Reserved visual scratch identity/dimensions invalid');identities.add(f.texture)}this.free=[...this.fields];}catch(error){for(const f of new Set(this.fields))port.release(f);throw error;}this.resources=this.fields.map(f=>({identity:f.texture,width:1024,height:1024,role:'reserved-visual-scratch'}));}
 acquire(w,h){if(this.disposed||w!==1024||h!==1024)throw Error('Reserved visual scratch scope');const f=this.free.pop();if(!f)throw Error('Reserved visual scratch capacity');this.leased.add(f);return f;}
 release(f){if(!this.leased.delete(f))throw Error('Foreign/double visual scratch release');this.free.push(f);}
 withEnginePool(engine,draw){const original=engine._ribbonScratchPool;engine._ribbonScratchPool=this;try{return draw();}finally{engine._ribbonScratchPool=original;}}
 /** Only after owner cancellation/normal GPU fence. Returns fields to their original owner pool. */
 disposeAfterFence(){if(this.disposed)return;if(this.leased.size)throw Error('Active visual scratch lease');this.disposed=true;this.free=[];for(const f of this.fields)this.port.release(f);}
}
