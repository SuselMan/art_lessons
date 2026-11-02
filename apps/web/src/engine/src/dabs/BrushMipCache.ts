/** Byte-bounded immutable CPU derivatives, separate from GPU residency.
 * Re-uploading an evicted texture must not rebuild its premultiplied pyramid. */
export class BrushMipCache {
  private readonly entries=new Map<string,readonly Uint8Array[]>()
  private optionalReclaims=new Set<()=>void>()
  private reclaiming=false
  /** Already-charged optional owner only. No credit or new budget is created. */
  registerOptionalReclaim(reclaim:()=>void):()=>void {
    if(this.reclaiming||typeof reclaim!=='function')throw new Error('CPU optional reclaim is busy or invalid')
    this.optionalReclaims.add(reclaim)
    return ()=>{this.optionalReclaims.delete(reclaim)}
  }
  private usedBytes=0
  private readonly reservations=new Map<symbol,number>()
  private readonly targetBytes:number
  constructor(targetBytes=4*1024*1024) {this.targetBytes=targetBytes}
  get bytes():number{return this.usedBytes}
  get budgetBytes():number{return this.targetBytes}
  /** Pure read-only accounting observation; overrides must not mutate ownership. */
  get reservedBytes():number{return [...this.reservations.values()].reduce((a,b)=>a+b,0)}
  /** Retained/workspace peak charged before allocation, sharing the old cap. */
  reserve(bytes:number):()=>void {
    if(!Number.isSafeInteger(bytes)||bytes<0)throw new RangeError('CPU brush workspace exceeds its budget')
    if(this.reclaiming)throw new Error('Cannot reserve during CPU optional reclaim')
    let reserved=this.reservedBytes
    if(reserved+bytes>this.targetBytes&&this.optionalReclaims.size){
      this.reclaiming=true
      let failed=false,primary:unknown
      try{
        // Detach BEFORE callbacks. Every registered owner is attempted once,
        // even if another callback throws undefined or releases its neighbour.
        const owners=this.optionalReclaims;this.optionalReclaims=new Set()
        for(const reclaim of owners){
          try{reclaim()}catch(error){if(!failed){failed=true;primary=error}}
        }
      }finally{this.reclaiming=false}
      if(failed)throw primary
      reserved=this.reservedBytes
    }
    if(reserved+bytes>this.targetBytes)throw new RangeError('CPU brush workspace exceeds its budget')
    const token=Symbol();this.reservations.set(token,bytes);this.trim(this.targetBytes-(reserved+bytes))
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
