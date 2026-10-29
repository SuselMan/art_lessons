/** Byte-bounded immutable CPU derivatives, separate from GPU residency.
 * Re-uploading an evicted texture must not rebuild its premultiplied pyramid. */
export class BrushMipCache {
  private readonly entries=new Map<string,readonly Uint8Array[]>()
  private usedBytes=0
  private readonly reservations=new Map<symbol,number>()
  private readonly targetBytes:number
  constructor(targetBytes=4*1024*1024) {this.targetBytes=targetBytes}
  get bytes():number{return this.usedBytes}
  get budgetBytes():number{return this.targetBytes}
  get reservedBytes():number{return [...this.reservations.values()].reduce((a,b)=>a+b,0)}
  /** Retained/workspace peak charged before allocation, sharing the old cap. */
  reserve(bytes:number):()=>void {
    if(!Number.isSafeInteger(bytes)||bytes<0||this.reservedBytes+bytes>this.targetBytes)throw new RangeError('CPU brush workspace exceeds its budget')
    const token=Symbol();this.reservations.set(token,bytes);this.trim(this.targetBytes-this.reservedBytes)
    return ()=>{this.reservations.delete(token)}
  }
  private trim(limit:number):void {
    while(this.usedBytes>limit){
      const oldest=this.entries.keys().next().value;if(oldest===undefined)break
      this.usedBytes-=this.entries.get(oldest)!.reduce((sum,level)=>sum+level.byteLength,0);this.entries.delete(oldest)
    }
  }
  get(key:string,build:()=>readonly Uint8Array[]):readonly Uint8Array[] {
    const cached=this.entries.get(key)
    if(cached){this.entries.delete(key);this.entries.set(key,cached);return cached}
    const levels=build(),bytes=levels.reduce((sum,level)=>sum+level.byteLength,0)
    const available=this.targetBytes-this.reservedBytes
    if(bytes>available)return levels
    while(this.usedBytes+bytes>available){
      const oldest=this.entries.keys().next().value
      if(oldest===undefined)break
      this.usedBytes-=this.entries.get(oldest)!.reduce((sum,level)=>sum+level.byteLength,0)
      this.entries.delete(oldest)
    }
    this.entries.set(key,levels);this.usedBytes+=bytes;return levels
  }
  clear():void{this.entries.clear();this.usedBytes=0}
}
