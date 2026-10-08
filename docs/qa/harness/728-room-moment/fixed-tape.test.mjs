import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareFixedTape} from './fixed-tape.mjs'
test('adds original layer without changing packed stroke contract',()=>{const tape=[{type:'stroke',tool:'watercolor',layerId:'original',id:'s',userId:'u',timestamp:2,dabsPacked:'bytes',wet:[.2],preset:'normal'}];const before=JSON.stringify(tape),fixture=prepareFixedTape(tape);assert.equal(fixture.layer.layerId,'original');assert.equal(fixture.layer.timestamp,1);assert.equal(JSON.stringify(fixture.tape),before);assert.equal(fixture.tape,tape)})
test('rejects unbounded or missing structural fixture',()=>{for(const tape of [[],[{type:'stroke'}],[{},{}]])assert.throws(()=>prepareFixedTape(tape))})
test('only structural seq normalization allowed',async()=>{const {equalOriginalStrokeParams}=await import('./fixed-tape.mjs');const original=[{id:'same',seq:0,dabsPacked:'exact',layerId:'original'}];assert.equal(equalOriginalStrokeParams(original,[{...original[0],seq:1}]),true);for(const change of [{dabsPacked:'changed'},{id:'new'},{layerId:'other'}])assert.equal(equalOriginalStrokeParams(original,[{...original[0],seq:1,...change}]),false)})
