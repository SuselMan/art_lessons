import test from 'node:test'
import assert from 'node:assert/strict'
import {PRESSURE_SHADER_SHA,assertActualPressureReady,assertActualPressureConsumed} from './actual-runtime-proof.mjs'
const census={actualAsyncPressureEnabled:true,asyncCarryPressure:{completed:true,hits:0}}
const marker={stage:'pressure-async-compile:completed',values:[JSON.stringify({completed:true,shaderSHA:PRESSURE_SHADER_SHA,dispatches:0,fieldBytes:0})]}
test('actual runtime must complete exact compile before pointer admission and consume matching factory',()=>{
 assertActualPressureReady([marker],census)
 assert.throws(()=>assertActualPressureConsumed(census),/never consumed/)
 assert.equal(assertActualPressureConsumed({...census,asyncCarryPressure:{completed:true,hits:1}}).hits,1)
})
test('missing/duplicate markers, injected-only state and wrong descriptor fail before DOWN',()=>{
 for(const markers of [[],[marker,marker],[{...marker,values:[JSON.stringify({completed:true,shaderSHA:'wrong',dispatches:0,fieldBytes:0})]}]])assert.throws(()=>assertActualPressureReady(markers,census))
 assert.throws(()=>assertActualPressureReady([marker],{...census,actualAsyncPressureEnabled:false}))
})
