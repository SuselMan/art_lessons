import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeTimelineTrace} from './trace-summary.mjs'
test('trace attribution requires actual thread metadata and keeps marker clock',()=>{const x=summarizeTimelineTrace({traceEvents:[{ph:'M',name:'thread_name',pid:1,tid:2,args:{name:'CrRendererMain'}},{ph:'X',name:'RunTask',pid:1,tid:2,ts:200,dur:12000},{ph:'R',name:'QA_NATIVE_FIRST_DOWN',pid:1,tid:2,ts:300}]});assert.equal(x.rendererMainMetadataAvailable,true);assert.equal(x.gpuThreadMetadataAvailable,false);assert.equal(x.topCompleteSpansOver10ms[0].durationMs,12);assert.equal(x.marks[0].tsUs,300);assert.equal(x.targetRendererPid,1);assert.equal(x.targetRendererSpansOver10ms.length,1)})
