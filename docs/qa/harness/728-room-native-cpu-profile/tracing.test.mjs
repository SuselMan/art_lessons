import test from 'node:test'
import assert from 'node:assert/strict'
import {validateTraceChunk,TRACE_CAP_BYTES} from './tracing.mjs'
test('trace stream remains byte-bounded including base64 and UTF8',()=>{assert.equal(validateTraceChunk({data:'AQID',base64Encoded:true},0).length,3);assert.equal(validateTraceChunk({data:'я'},0).length,2);assert.throws(()=>validateTraceChunk({data:'xx'},TRACE_CAP_BYTES-1))})
