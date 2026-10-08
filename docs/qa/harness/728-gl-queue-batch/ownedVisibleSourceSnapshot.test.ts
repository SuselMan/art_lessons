import { expect,it } from 'vitest'
import { captureOwnedVisibleSource, type SnapshotRole } from './OwnedVisibleSourceSnapshot'
class Field {
  readonly texture = {}; readonly width=2;readonly height=2;readonly bytes=new Uint8Array(16)
  constructor(value:number){this.bytes.fill(value)}
  copyTo(other:Field){other.bytes.set(this.bytes)}
}
const source=()=>Object.fromEntries(['presentation','pigmentFilm','colourFilm','solventFilm','coverageFilm'].map((role,i)=>[role,new Field(i+1)])) as Record<SnapshotRole,Field>
it('copies five distinct owned textures in source order; later source mutation cannot change captured films',()=>{
 const src=source(),calls:string[]=[],retired:Field[][]=[]
 for(const [role,f]of Object.entries(src)){const original=f.copyTo.bind(f);f.copyTo=(out)=>{calls.push('copy:'+role);original(out)}}
 const owned=captureOwnedVisibleSource(src,{create(role){calls.push('create:'+role);return new Field(0)},retire(fields){retired.push([...fields])}})
 expect(owned.bytes).toBe(80);expect(new Set(owned.resources.map(r=>r.identity)).size).toBe(5)
 expect(calls).toEqual(Object.keys(src).flatMap(role=>['create:'+role,'copy:'+role]))
 for(const role of Object.keys(src)as SnapshotRole[]){expect(owned.fields[role].bytes).toEqual(src[role].bytes);src[role].bytes.fill(99);expect(owned.fields[role].bytes[0]).not.toBe(99)}
 owned.release();owned.release();expect(retired).toHaveLength(1);expect(retired[0]).toHaveLength(5)
})
it('rejects borrowed alias and never retires borrowed resources; failure retires only allocated prefix',()=>{
 const src=source(),retired:Field[][]=[];let n=0
 expect(()=>captureOwnedVisibleSource(src,{create(){return n++===2?src.presentation:new Field(0)},retire(fields){retired.push([...fields])}})).toThrow('aliases borrowed')
 expect(retired[0]).toHaveLength(2);expect(retired[0]).not.toContain(src.presentation)
})
it('copy failure is cleaned through the explicit GPU-safe retirement seam',()=>{
 const src=source(),retired:Field[][]=[];src.colourFilm.copyTo=()=>{throw Error('copy failed')}
 expect(()=>captureOwnedVisibleSource(src,{create(){return new Field(0)},retire(fields){retired.push([...fields])}})).toThrow('copy failed');expect(retired[0]).toHaveLength(3)
})
