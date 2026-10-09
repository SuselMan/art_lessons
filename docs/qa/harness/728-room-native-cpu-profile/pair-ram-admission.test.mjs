import {test} from 'node:test'
import assert from 'node:assert/strict'
import {awaitPairRam} from './pair-ram-admission.mjs'
test('passive reclaim then fresh admission without lowering threshold',async()=>{let t=0,i=0;const rows=[];assert.equal(await awaitPairRam(async()=>[1600,1650,1700][i++],{now:()=>t,sleep:async ms=>{t+=ms},record:v=>rows.push(v)}),1700);assert.deepEqual(rows,[1600,1650,1700])})
test('low/unavailable RAM fail bounded; no context action in guard',async()=>{let t=0;await assert.rejects(awaitPairRam(async()=>1699,{now:()=>t,sleep:async ms=>{t+=ms},budgetMs:3000}));assert.equal(t,3000);await assert.rejects(awaitPairRam(async()=>NaN));await assert.rejects(awaitPairRam(async()=>2000,{budgetMs:30001}))})
