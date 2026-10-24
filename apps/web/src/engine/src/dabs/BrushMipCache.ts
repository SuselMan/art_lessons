/** Byte-bounded immutable CPU derivatives, separate from GPU residency.
 * Re-uploading an evicted texture must not rebuild its premultiplied pyramid. */
export class BrushMipCache {
  private readonly entries=new Map<string,readonly Uint8Array[]>()
  private usedBytes=0
  constructor(private readonly targetBytes=4*1024*1024) {}
  get bytes():number{return this.usedBytes}
  get(key:string,build:()=>readonly Uint8Array[]):readonly Uint8Array[] {
    const cached=this.entries.get(key)
    if(cached){this.entries.delete(key);this.entries.set(key,cached);return cached}
    const levels=build(),bytes=levels.reduce((sum,level)=>sum+level.byteLength,0)
    if(bytes>this.targetBytes)return levels
    while(this.usedBytes+bytes>this.targetBytes){
      const oldest=this.entries.keys().next().value
      if(oldest===undefined)break
      this.usedBytes-=this.entries.get(oldest)!.reduce((sum,level)=>sum+level.byteLength,0)
      this.entries.delete(oldest)
    }
    this.entries.set(key,levels);this.usedBytes+=bytes;return levels
  }
  clear():void{this.entries.clear();this.usedBytes=0}
}
