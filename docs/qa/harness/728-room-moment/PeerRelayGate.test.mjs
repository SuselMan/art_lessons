import test from'node:test';import assert from'node:assert/strict';import{peerRelayGate,protectManualRoom}from'./PeerRelayGate.mjs';
const rows=['stroke','operation_undo','operation_redo'].map((type,i)=>({type,seq:i+1,lease:true,active:true}));
test('actual order and sequence are mandatory; expired lease is incomparable',()=>{assert.deepEqual(peerRelayGate(rows),{comparable:true});assert.equal(peerRelayGate(rows.map(x=>({...x,lease:false}))).comparable,false);assert.throws(()=>peerRelayGate([rows[0],rows[2],rows[1]]));assert.throws(()=>peerRelayGate(rows.map(x=>({...x,seq:1}))));});
test('manual room cannot be used as the owned cohort',()=>{assert.throws(()=>protectManualRoom('manual','manual'));assert.throws(()=>protectManualRoom('own',undefined));protectManualRoom('own','manual');});
