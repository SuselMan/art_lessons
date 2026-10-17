import {expect,it} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
// Independent deliberately small oracle: one disc per gesture, full O(n²)
// edges + BFS; no production footprint/union/spatial/timeline cache helpers.
type Item={op:Operation;state:'done'|'undone'|'branch'}
function oracle(history:Operation[]){
 const items:Item[]=[],allowed=new Map<string,Set<string>>(),connectors=new Map<string,Set<string>>()
 let ghosts=new Set<string>()
 const solve=(enabled:Set<string>,unrestricted:Set<string>,historical?:Set<string>)=>{
  let retained=new Set(items.filter(i=>i.op.type==='stroke'&&i.state!=='done'&&enabled.has(i.op.id)).map(i=>i.op.id))
  for(;;){
   const epochs=new Map<string,number>(),nodes:Array<{item:Item;epoch:number}>=[]
   for(const item of items){const op=item.op
    if(op.type==='paper_dry'&&item.state==='done'&&op.layerId)epochs.set(op.layerId,(epochs.get(op.layerId)??0)+1)
    if(op.type==='stroke'&&(item.state==='done'||retained.has(op.id))&&(!historical||historical.has(op.id)))nodes.push({item,epoch:epochs.get(op.layerId)??0})
   }
   const component=new Map<string,Set<string>>()
   for(const start of nodes)if(!component.has(start.item.op.id)){
    const group=new Set<string>(),queue=[start]
    while(queue.length){const current=queue.pop()!,op=current.item.op as StrokeOperation
     if(group.has(op.id))continue
     group.add(op.id)
     for(const candidate of nodes){const next=candidate.item.op as StrokeOperation
      if(candidate.epoch===current.epoch&&next.layerId===op.layerId&&Math.hypot(next.dabs![0].x-op.dabs![0].x,next.dabs![0].y-op.dabs![0].y)<=10&&!group.has(next.id))queue.push(candidate)
     }
    }
    for(const id of group)component.set(id,group)
   }
   const supported=new Set<string>(),consumers=new Map<string,Set<string>>()
   for(const id of retained){const source=items.find(i=>i.op.id===id)!,group=component.get(id)??new Set<string>()
    for(const consumer of items)if(consumer.op.type==='stroke'&&consumer.state==='done'&&consumer.op.userId!==source.op.userId&&items.indexOf(consumer)>items.indexOf(source)&&group.has(consumer.op.id)&&(unrestricted.has(id)||allowed.get(id)?.has(consumer.op.id))){
     supported.add(id);const ids=consumers.get(id)??new Set<string>();ids.add(consumer.op.id);consumers.set(id,ids)
    }
   }
   if(supported.size===retained.size)return {retained:supported,consumers,component}
   retained=supported
  }
 }
 for(const op of history){
  const unrestricted=new Set(ghosts),enabled=new Set(ghosts)
  if(op.type!=='operation_undo'&&op.type!=='operation_redo')for(const item of items)if(item.state==='undone'&&item.op.userId===op.userId)item.state='branch'
  items.push({op,state:'done'})
  if(op.type==='operation_undo'||op.type==='operation_redo'){
   const target=items.find(i=>i.op.id===op.targetOpId)
   if(target&&target.op.userId===op.userId){
    if(op.type==='operation_undo'&&target.state==='done'){
     target.state='undone'
     if(target.op.type==='paper_dry'){
      const boundary=items.indexOf(target),layer=target.op.layerId
      for(const [source,consumers]of allowed){const original=items.find(i=>i.op.id===source)
       if(original?.op.type==='stroke'&&original.op.layerId===layer&&consumers.size){
        const historical=new Set(connectors.get(source));historical.add(source)
        const positions=items.flatMap((item,index)=>item.op.type==='stroke'&&item.op.layerId===layer&&historical.has(item.op.id)?[index]:[])
        if(positions.some(index=>index<boundary)&&positions.some(index=>index>boundary)&&solve(new Set([...enabled,source]),new Set(),historical).retained.has(source))enabled.add(source)
       }
      }
     }
     if(target.op.type==='stroke'){allowed.delete(target.op.id);connectors.delete(target.op.id);enabled.add(target.op.id);unrestricted.add(target.op.id)}
    }else if(op.type==='operation_redo'&&target.state==='undone'){
     target.state='done';allowed.delete(target.op.id);connectors.delete(target.op.id)
     for(const [id,links]of connectors)if(links.has(target.op.id))enabled.add(id)
    }
   }
  }
  const solved=solve(enabled,unrestricted)
  for(const id of unrestricted){
   const consumers=allowed.get(id)??new Set<string>();for(const foreign of solved.consumers.get(id)??[])consumers.add(foreign);allowed.set(id,consumers)
   const links=connectors.get(id)??new Set<string>();for(const linked of solved.component.get(id)??[])links.add(linked);connectors.set(id,links)
  }
  ghosts=solved.retained
 }
 return items.flatMap(item=>item.state==='done'?[`${item.op.id}:full`]:ghosts.has(item.op.id)?[`${item.op.id}:water`]:[])
}
const rng=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
it('500 three-author disc histories agree with independent whole-water graph oracle at every prefix',()=>{
 let checks=0,undoDry=0,redoDry=0,protectedViews=0
 for(let seed=1;seed<=500;seed++){
  const random=rng(seed),log=new OperationLog(),history:Operation[]=[]
  for(let step=0;step<20;step++){
   const userId=['A','B','C'][Math.floor(random()*3)],choice=random(),id=`s${seed}-${step}`
   let op:Operation
   const target=choice<.25?log.undoTarget(userId):choice<.4?log.redoTarget(userId):null
   if(target)op={id,type:choice<.25?'operation_undo':'operation_redo',targetOpId:target.id,userId,timestamp:step}
   else if(choice>.91)op={id,type:'paper_dry',layerId:random()<.8?'L':'M',userId,timestamp:step}
   else op={id,type:'stroke',strokeId:id,washId:'m70:L',layerId:random()<.8?'L':'M',userId,timestamp:step,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x:Math.floor(random()*5)*8,y:0,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]}
   if(target?.type==='paper_dry'){if(op.type==='operation_undo')undoDry++;if(op.type==='operation_redo')redoDry++}
   history.push(op);log.append(op,{serverSeq:step+1},false)
   if(op.type==='operation_undo')log.applyUndo(op.targetOpId,userId)
   if(op.type==='operation_redo')log.applyRedo(op.targetOpId,userId)
   const actual=log.watercolorEffectiveOperations().map(op=>`${op.id}:${op.type==='stroke'&&op.preset.split(':')[2]==='0'?'water':'full'}`)
   if(actual.some(value=>value.endsWith(':water')))protectedViews++
   expect(actual,JSON.stringify({seed,step,history})).toEqual(oracle(history));checks++
  }
 }
 expect(checks).toBe(10000)
 expect(undoDry).toBeGreaterThan(10);expect(redoDry).toBeGreaterThan(5);expect(protectedViews).toBeGreaterThan(100)
},20000)
it('Redo Dry followed immediately by Undo Dry restores the previously protected whole water',()=>{
 const log=new OperationLog()
 let time=0
 const apply=(op:Operation)=>{log.append(op,{serverSeq:++time},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId);if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId)}
 const wet=(id:string,userId:string,x:number):StrokeOperation=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',timestamp:time,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[{x,y:0,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]})
 const control=(id:string,type:'operation_undo'|'operation_redo',targetOpId:string,userId:string):Operation=>({id,type,targetOpId,userId,timestamp:time})
 apply(wet('a','A',0));apply({id:'dry',type:'paper_dry',layerId:'L',userId:'C',timestamp:time});apply(wet('b','B',5))
 apply(control('undo-dry','operation_undo','dry','C'));apply(control('undo-a','operation_undo','a','A'))
 const material=()=>log.layerPixelOps('L').filter(op=>op.type==='stroke').map(op=>[op.id,op.preset])
 const before=material()
 expect(before.map(([id])=>id)).toEqual(['a','b'])
 apply(control('redo-dry','operation_redo','dry','C'))
 expect(material().map(([id])=>id)).toEqual(['b'])
 apply(control('undo-dry-again','operation_undo','dry','C'))
 expect(material()).toEqual(before)
})
