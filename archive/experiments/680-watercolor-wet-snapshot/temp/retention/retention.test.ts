import{it,expect}from'vitest';
import{createTestEngine,makeLayerAdd}from'/home/suselman/projects/pencil-agents/680-device-qa-guards/apps/web/src/engine/testing/engineTestUtils';
import{hasActiveWater}from'/home/suselman/projects/pencil-agents/680-device-qa-guards/apps/web/src/engine/src/oplog/hasActiveWater';
import{isCoveredBySnapshot,residentOperationWhere}from'/home/suselman/projects/pencil-agents/680-device-qa-guards/apps/server/src/rooms/snapshotCoverage';
const at=Date.now()-130000,layerId='layer-1';const dab={x:20,y:20,size:8,pressure:.8,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:.5,t:0};
const donor:any={id:'retention-water',strokeId:'retention-water',washId:'water',type:'stroke',userId:'A',seq:1,layerId,timestamp:at,tool:'watercolor',preset:'normal:100:0:PB29:round',color:[.3,.12,.6],dabs:[dab]};
const pig:any={...donor,id:'retention-pigment',strokeId:'retention-pigment',washId:'pigment',userId:'B',seq:2,timestamp:at+1000,preset:'normal:0:100:PB29:round',wet:'f'};
it('expired snapshot eligibility and coverage do not carry historical donor geometry',()=>{
 expect(hasActiveWater([donor],layerId,at+130000)).toBe(false);expect(isCoveredBySnapshot(new Map([[layerId,1]]),donor)).toBe(true);expect(isCoveredBySnapshot(new Map([[layerId,1]]),pig)).toBe(false);
 expect(residentOperationWhere('room',new Map([[layerId,1]]))).toMatchObject({NOT:{OR:[{layerId,seq:{lte:1}}]}});
 const select=(ops:any[])=>{const{engine}=createTestEngine({paper:'flat'},{width:64,height:64});const E=engine as any;engine.appendOperation(makeLayerAdd('owner',layerId),'remote');let sources:any=[];
 E._ribbonPainter.paint=function*(...args:any[]){if(args[3]===pig.preset)sources=JSON.parse(JSON.stringify(args[6].foreignSources));};
 try{for(const op of ops)engine.appendOperation(op,'remote');return sources;}finally{engine.destroy();}};
 const full=select([donor,pig]),tail=select([pig]);expect(full.map((s:any)=>s.gesture)).toEqual([donor.strokeId]);expect(full[0].footprints).toHaveLength(1);expect(tail).toEqual([]);
});
