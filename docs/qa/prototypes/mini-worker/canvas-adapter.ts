/** Worker-local host adapter. Renderer uses the real transferred GL canvas;
 * PointerInput receives the same pointer fields in fixed 1024 canvas coordinates. */
export function createCanvasAdapter(source:HTMLCanvasElement|OffscreenCanvas,size:number|{width:number;height:number}){
 const width=typeof size==='number'?size:size.width,height=typeof size==='number'?size:size.height
 const listeners=new Map<string,Set<(event:any)=>void>>(),native=new Map<string,Map<any,any>>()
 let connected=true
 const canvas={
  get width(){return source.width},set width(value:number){source.width=value},
  get height(){return source.height},set height(value:number){source.height=value},
  style:{touchAction:''},get isConnected(){return connected},
  getContext:(...args:any[])=>(source.getContext as any)(...args),
  getBoundingClientRect:()=>({left:0,top:0,right:width,bottom:height,x:0,y:0,width,height}),
  setPointerCapture:(_id:number)=>{},releasePointerCapture:(_id:number)=>{},hasPointerCapture:(_id:number)=>true,
  addEventListener(type:string,fn:any){if(type.startsWith('webgl')){let map=native.get(type);if(!map)native.set(type,map=new Map());map.set(fn,fn);source.addEventListener(type,fn);return}let set=listeners.get(type);if(!set)listeners.set(type,set=new Set());set.add(fn)},
  removeEventListener(type:string,fn:any){if(type.startsWith('webgl')){source.removeEventListener(type,fn);native.get(type)?.delete(fn)}else listeners.get(type)?.delete(fn)},
 }
 return {canvas:canvas as unknown as HTMLCanvasElement,
  pointer(input:any){const make=(p:any)=>({...p,timeStamp:p.epochTime-performance.timeOrigin,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},target:canvas,currentTarget:canvas});const event=make(input);event.getCoalescedEvents=()=>input.coalesced?.length?input.coalesced.map(make):[event];for(const fn of [...(listeners.get(input.type)??[])])fn.call(canvas,event)},
  destroy(){connected=false;listeners.clear();for(const [type,map]of native)for(const fn of map.keys())source.removeEventListener(type,fn);native.clear()},
 }
}
