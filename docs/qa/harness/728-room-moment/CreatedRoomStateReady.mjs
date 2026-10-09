/** Actual room_state participant reflection; optimistic creator engine is insufficient. */
export function createdRoomStateReady(){
 const e=window.__engine,s=window.__roomStore?.getState();
 return !!(e&&s?.room?.id&&s.userId&&s.userId!=='local'&&e._userId===s.userId&&!e._locked&&e._paper.loaded&&s.participants?.some(p=>p.userId===s.userId));
}
