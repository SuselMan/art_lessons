import test from 'node:test'
import assert from 'node:assert/strict'
import {compareZeroStateStages} from './zero-state-guard.mjs'
const roles=['P','C','inkBase','colorBase','strokeInk','strokeColor']
function fixture(){const records=Array.from({length:3},()=>({operatorRect:{x:0,y:0,width:96,height:96},capture:{x:0,y:0,width:96,height:96},stages:[...roles.map(role=>({stage:'source-'+role,sha:role})),...roles.map(role=>({stage:'post-'+role,sha:role})),{stage:'presentation-after-sourcepublish',sha:'frame'}]}));return{records,reference:structuredClone(records)}}
test('visible equality cannot hide base/film state change or next-contact source divergence',()=>{
 const {records,reference}=fixture();assert.equal(compareZeroStateStages(records,reference).valid,true)
 records[0].stages.find(s=>s.stage==='post-inkBase').sha='P';assert.equal(compareZeroStateStages(records,reference).valid,false)
 const next=fixture();next.reference[2].stages[0].sha='wrong source';assert.equal(compareZeroStateStages(next.records,next.reference).valid,false)
 const crop=fixture();crop.reference[0].capture.x=1;assert.equal(compareZeroStateStages(crop.records,crop.reference).valid,false)
})
