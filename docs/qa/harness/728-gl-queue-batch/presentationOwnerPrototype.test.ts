import { describe, expect, it } from 'vitest'
import { PresentationOwnerPrototype, type OwnerToken } from './PresentationOwnerPrototype'
const create = () => new PresentationOwnerPrototype<{ values: number[] }>({ maxOwners: 3, budgetBytes: 24, detachFinish: input => Object.freeze({ values: Object.freeze([...input.values]) as unknown as number[] }) })
const lease = (bytes = 8) => { let released = 0; return { bytes, resources: [{identity:{},role:'presentation' as const,width:1,height:1},{identity:{},role:'canonical-source' as const,width:1,height:(bytes-4)/4}], release: () => { released++ }, count: () => released } }
const admit = (q: ReturnType<typeof create>, gesture: number, l = lease(), layer = 'L'): OwnerToken => {
  const result = q.admit(layer, gesture, l)
  if (!result.accepted) throw Error('fixture admission rejected')
  return result.token
}
describe('QA separate presentation owners / serial canonical FIFO', () => {
  it('admits third while first canonical active; UP and old landing keep newest source visible', () => {
    const q = create(), leases = [lease(), lease(), lease()]
    const a = admit(q, 1, leases[0]); q.publishSource(a); q.seal(a, { values: [1] }); expect(q.takeCanonical()?.token).toBe(a)
    const b = admit(q, 2, leases[1]); q.publishSource(b); q.seal(b, { values: [2] })
    const c = admit(q, 3, leases[2]); q.publishSource(c); q.seal(c, { values: [3] })
    expect(q.visible()).toEqual([a,b,c]); expect(q.takeCanonical()).toBeNull()
    q.land(a); expect(q.visible()).toEqual([b,c]); expect(leases.map(l => l.count())).toEqual([1,0,0])
    expect(q.takeCanonical()?.token).toBe(b); q.land(b); expect(q.visible()).toEqual([c]); expect(q.takeCanonical()?.token).toBe(c)
    q.land(c); expect(q.snapshot().bytes).toBe(0); expect(leases.map(l => l.count())).toEqual([1,1,1])
  })
  it('detaches finish metadata from later mutable input and rejects stale landing', () => {
    const q = create(), a = admit(q,1), source = { values: [7] }; q.seal(a,source); source.values[0]=99
    expect(q.takeCanonical()?.finish.values).toEqual([7]); q.land(a); expect(() => q.land(a)).toThrow()
  })
  it('capacity/memory rejection leaves caller ownership; no synchronous completion API exists', () => {
    const q=create(); for(let i=0;i<3;i++)admit(q,i)
    const rejected=lease(); expect(q.admit('L',4,rejected)).toEqual({accepted:false,reason:'capacity'}); expect(rejected.count()).toBe(0)
    const r=create(), tooLarge=lease(32); expect(r.admit('L',1,tooLarge)).toEqual({accepted:false,reason:'memory'});expect(tooLarge.count()).toBe(0)
  })
  it('cannot overtake an unsealed source; cancel releases exactly once and isolates other layer', () => {
    const q=create(), first=lease(), second=lease(), a=admit(q,1,first), b=admit(q,2,second,'other');q.publishSource(b);q.seal(b,{values:[2]})
    expect(q.takeCanonical()).toBeNull(); q.cancelLayer('L');expect(q.cancel(a)).toBe(false);expect(first.count()).toBe(1);expect(q.visible()).toEqual([b])
    expect(q.takeCanonical()?.token).toBe(b);q.dispose();q.dispose();expect(second.count()).toBe(0);expect(q.takeCanonical()).toBeNull();q.completeCancellation(b);expect(second.count()).toBe(1);expect(q.snapshot().bytes).toBe(0)
  })
  it('rejects shared writable physical sources across owners and false byte accounting', () => {
    const q=create(),a=lease();admit(q,1,a);expect(()=>q.admit('L',2,a)).toThrow('resource alias');const wrong=lease();expect(()=>q.admit('L',2,{...wrong,bytes:4})).toThrow('resource ledger')
  })
  it('detaches lease accounting and disposes other owners even when one release fails', () => {
    const q=create(),a=lease(),b=lease();const token=admit(q,1,a);admit(q,2,b);a.resources.length=0;a.bytes=0;q.cancel(token);expect(q.snapshot().bytes).toBe(8);expect(a.count()).toBe(1);q.dispose();expect(b.count()).toBe(1)
    const r=create(),bad={...lease(),release(){throw Error('bad')}};admit(r,1,bad);const other=lease();admit(r,2,other);expect(()=>r.dispose()).toThrow('Owner release failures');expect(other.count()).toBe(1);expect(r.snapshot().bytes).toBe(0)
  })
  it('active cancellation holds lease and blocks the next job until its explicit fence', () => {
    const q=create(),aLease=lease(),a=admit(q,1,aLease),b=admit(q,2);q.publishSource(b);q.seal(a,{values:[1]});q.seal(b,{values:[2]});q.takeCanonical();q.cancel(a);expect(aLease.count()).toBe(0);expect(q.takeCanonical()).toBeNull();expect(q.land(a)).toBe(false);expect(q.visible()).toEqual([b]);q.completeCancellation(a);expect(aLease.count()).toBe(1);expect(q.takeCanonical()?.token).toBe(b);expect(q.land(a)).toBe(false);expect(q.snapshot().active).toBe(b)
    expect(()=>q.completeCancellation(a)).toThrow();
  })
  it('rejects multiplication/sum overflow in resource byte accounting', () => {
    const q=create(),l=lease();l.resources[0].width=Number.MAX_SAFE_INTEGER;expect(()=>q.admit('L',1,l)).toThrow('overflow')
  })
  it('a throwing old-owner release cannot remove newer source or corrupt accounting', () => {
    const q=create(),a=admit(q,1,{...lease(),release(){throw Error('release failed')}}),b=admit(q,2);q.publishSource(b);q.seal(a,{values:[1]});q.takeCanonical()
    expect(()=>q.land(a)).toThrow('release failed');expect(q.snapshot().bytes).toBe(8);expect(q.visible()).toEqual([b]);expect(q.cancel(a)).toBe(false)
  })
})
