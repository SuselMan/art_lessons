import test from'node:test';import assert from'node:assert/strict';import{compareLiveRoomIdentity}from'./LiveRoomIdentityProof.mjs';
const a={actor:'guest-a',engineActor:'guest-a',roomId:'room-a',locked:false};
test('same actor/room proves fixture identity only, not model',()=>assert.deepEqual(compareLiveRoomIdentity(a,a),{valid:true,kind:'same-actual-room-actor',modelVerdict:null}));
test('auth/navigation changed guest and local actors reject before drawing without model blame',()=>{for(const b of [{...a,actor:'guest-b',engineActor:'guest-b'},{...a,actor:'local',engineActor:'local'},{...a,roomId:'room-b'},{...a,engineActor:'other'},{...a,locked:true}]){const p=compareLiveRoomIdentity(a,b);assert.equal(p.valid,false);assert.equal(p.modelVerdict,null)}});
