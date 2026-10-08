/** CPU-only chronology. IDs are local to one owner, no pixels/URLs recorded. */
export class SourceOrderTrace {
 private readonly ids=new WeakMap<object,number>();private next=0
 private readonly events:Array<{seq:number;kind:string;data:unknown}>=[]
 private readonly counts:Record<string,number>={}
 active=true
 constructor(privateLimit=2048){this.limit=privateLimit}
 private readonly limit:number
 id(value:object){let id=this.ids.get(value);if(!id){id=++this.next;this.ids.set(value,id)}return id}
 record(kind:string,data:unknown){if(!this.active)return;this.counts[kind]=(this.counts[kind]??0)+1;if(this.events.length<this.limit)this.events.push({seq:this.events.length,kind,data:structuredClone(data)})}
 stop(){this.active=false}
 result(){return{events:structuredClone(this.events),counts:{...this.counts},truncated:Object.values(this.counts).reduce((a,b)=>a+b,0)>this.events.length}}
}
export function traceBytes(data:AllowSharedBufferSource){const v=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);let h=2166136261;for(const b of v)h=Math.imul(h^b,16777619)>>>0;return{bytes:v.byteLength,fnv:h.toString(16)}}
