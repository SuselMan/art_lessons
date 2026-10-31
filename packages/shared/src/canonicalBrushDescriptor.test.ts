import {expect,it} from 'vitest'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
it('pins identical bytes across insertion order while preserving nested array order and native JSON numbers',()=>{
 const a={z:undefined,tip:{z:-0,a:1},assets:[{z:2,a:1},{a:3}],name:'кисть'}
 const b={name:'кисть',assets:[{a:1,z:2},{a:3}],tip:{a:1,z:0}}
 expect(canonicalBrushDescriptorJSON(a)).toBe('{"assets":[{"a":1,"z":2},{"a":3}],"name":"кисть","tip":{"a":1,"z":0}}')
 expect(canonicalBrushDescriptorJSON(a)).toBe(canonicalBrushDescriptorJSON(b))
 expect(canonicalBrushDescriptorJSON({...a,assets:[...a.assets].reverse()})).not.toBe(canonicalBrushDescriptorJSON(a))
})
it('uses the existing server codepoint ordering including non-ASCII keys',()=>{
 expect(canonicalBrushDescriptorJSON({'я':1,'a':2,'Z':3,'ä':4})).toBe('{"Z":3,"a":2,"ä":4,"я":1}')
})
