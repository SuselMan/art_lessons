/** Fixture provenance only; a different guest actor is NOT a rendering verdict. */
export function compareLiveRoomIdentity(created,joined){
 if(!created?.actor||created.actor==='local'||created.actor!==created.engineActor)return{valid:false,kind:'fixture-create-identity',modelVerdict:null};
 if(!joined?.actor||joined.actor==='local'||joined.actor!==joined.engineActor)return{valid:false,kind:'fixture-joined-identity',modelVerdict:null};
 if(created.roomId!==joined.roomId||created.actor!==joined.actor)return{valid:false,kind:'fixture-navigation-identity-changed',modelVerdict:null};
 if(joined.locked)return{valid:false,kind:'fixture-joined-locked',modelVerdict:null};
 return{valid:true,kind:'same-actual-room-actor',modelVerdict:null};
}
