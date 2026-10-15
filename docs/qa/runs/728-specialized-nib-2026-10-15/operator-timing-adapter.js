export function install(e){
 const gl=e.gl,passes=e._watercolorPasses,rows=new Map(),originals=[];const repeats=8;
 const shape=b=>b?`${b.width}x${b.height}`:'none';
 for(const name of ['waterFrontStep','fieldOp','brushPass','wcResample']){
  const original=passes[name];originals.push([name,original]);
  passes[name]=function(...a){
   if(!e._wcDryWorkScheduler?.active)return original.apply(this,a);
   let key,out,inputs,detail;
   if(name==='waterFrontStep'){out=a[5];inputs=[a[4]];key=`${name}:stride${a[9]??1}:${shape(out)}`;detail={stride:a[9]??1,scale:a[10]??1,max:a[6],climb:a[7],floor:a[8]}}
   if(name==='fieldOp'){out=a[0];inputs=[a[1],a[2],a[5]?.c,a[5]?.d,a[5]?.e];key=`${name}:mode${a[3]}:${a[3]===1?(a[4]===0?'zero':'add'):''}:${shape(out)}:${a[5]?.scissor?'rect':'full'}`;detail={mode:a[3],k:a[4],scissor:a[5]?.scissor}}
   if(name==='brushPass'){out=a[5];inputs=[a[4],a[6],a[9]];key=`${name}:${a[4]===a[6]?'P':'C'}:${shape(out)}`;detail={scale:a[3],scissor:a[8]}}
   if(name==='wcResample'){out=a[0];inputs=[a[5],a[10],a[11]];key=`${name}:mode${a[9]}:${shape(a[5])}->${shape(out)}`;detail={mode:a[9],rect:a.slice(1,5),scale:a[8]}}
   const existing=rows.get(key);if(existing){existing.calls++;return original.apply(this,a)}
   if(rows.size>=40||inputs.some(x=>x===out)||gl.isContextLost())return original.apply(this,a);
   const complete=()=>{gl.finish();out.readPixelsRegion(0,0,1,1)};
   complete();let at=performance.now();const value=original.apply(this,a);complete();const firstMs=performance.now()-at;
   original.apply(this,a);complete();at=performance.now();for(let i=0;i<repeats;i++){original.apply(this,a);complete()}const hotTotalMs=performance.now()-at;
   at=performance.now();for(let i=0;i<repeats;i++)complete();const fenceTotalMs=performance.now()-at;
   rows.set(key,{key,calls:1,detail,firstMs,repeats,hotTotalMs,hotPerCallMs:hotTotalMs/repeats,fencePerCallMs:fenceTotalMs/repeats,deltaProxyMs:Math.max(0,(hotTotalMs-fenceTotalMs)/repeats)});return value;
  };
 }
 return{stats:()=>({method:'CPU submission plus per-call dependent readPixels completion; separate empty read baseline; delta is only a proxy, not GPU timer-query time or a replay decomposition',repeats,rows:[...rows.values()]}),dispose(){for(const[name,original]of originals)passes[name]=original}};
}
