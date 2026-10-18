/** Full host wall spans in one owned native run. No GPU calls are added here.
 * GPU query elapsed durations have their own clock and must remain unaligned. */
const KEY='__qaNativeCpuTimeline805'
export interface NativeCpuTask805 {
 id:string;operation:string;parentId?:string;groupId?:string;label:string
 lane:'cpu'|'transfer';clock:'host';wallAligned:true
 startMs:number;endMs:number;elapsedMs:number;scope:string
}
const labels:Record<string,string>={
 'source.before-proof':'Захватить и проверить семь исходных карт','source.after-proof':'Повторно проверить семь исходных карт',
 'source.capture-seven':'Получить семь карт источника','sha.maps':'Посчитать SHA карт',
 'metadata.before':'Зафиксировать метаданные до расчёта','metadata.after':'Проверить метаданные после расчёта','metadata.hash':'Посчитать SHA метаданных',
 core:'Выполнить native core: CPU-работа и отправка команд','output.c-read':'Дождаться GPU и прочитать весь конечный цвет',
 'output.proof':'Проверить конечные P/C/покрытие','output.p-read':'Прочитать конечную карту краски P','output.coverage-read':'Прочитать конечное покрытие',
 'selection.readback':'Получить карту отбора с GPU','selection.filter':'Отфильтровать мелкие островки на CPU','selection.upload':'Вернуть маску отбора на GPU',
 'gl.validation':'Проверить ошибку WebGL','query.poll':'Асинхронно дождаться ответа GPU-таймеров'
}
const groupIds=['ungrouped','prepare','selection','paths','transport','assemble','background','protect']
const groupLabels=['Начальные копии и выравнивание','Усреднение цвета','Отбор краски и сборка поля','Карты путей и кромки','Перенос и смешивание','Общая сухая кромка и сборка','Обработка заливки','Защита сухого и завершение']
export async function collectNativeCpuTimeline805<T>(work:()=>Promise<T>,options:{now?:()=>number}={}){
 const target=globalThis as unknown as Record<string,unknown>,descriptor=Object.getOwnPropertyDescriptor(target,KEY)
 if(target[KEY]!==undefined)throw Error('CPU timeline already installed')
 const now=options.now??(()=>performance.now()),origin=now(),tasks:NativeCpuTask805[]=[],stack:{id:string;operation:string;parentId?:string;lane:'cpu'|'transfer';startMs:number}[]=[],counts=new Map<string,number>()
 const events:{stage:string;atMs:number;occurrence:number}[]=[],seen=new Map<string,number>()
 const hook=(event:{type?:string;id?:string;lane?:'cpu'|'transfer';stage?:string})=>{
  const atMs=now()-origin;if(!Number.isFinite(atMs)||atMs<0)throw Error('CPU timeline invalid clock')
  if(event.type==='stage'){
   if(typeof event.stage!=='string')throw Error('CPU timeline invalid stage')
   const occurrence=seen.get(event.stage)??0;seen.set(event.stage,occurrence+1);events.push({stage:event.stage,atMs,occurrence});return
  }
  if(typeof event.id!=='string')throw Error('CPU timeline missing span id')
  if(event.type==='begin'){
   const occurrence=counts.get(event.id)??0;counts.set(event.id,occurrence+1)
   stack.push({id:event.id+'-'+occurrence,operation:event.id,parentId:stack.at(-1)?.id,lane:event.lane??'cpu',startMs:atMs});return
  }
  if(event.type!=='end'||stack.at(-1)?.operation!==event.id)throw Error('CPU timeline span nesting/order mismatch '+event.id)
  const active=stack.pop()!;if(atMs<active.startMs)throw Error('CPU timeline nonmonotonic clock')
  tasks.push({...active,label:labels[event.id]??(event.id.startsWith('source.capture-')?'Источник: '+event.id.slice('source.capture-'.length):event.id),clock:'host',wallAligned:true,endMs:atMs,elapsedMs:atMs-active.startMs,scope:active.lane==='transfer'?'Время host-вызова: может включать ожидание предыдущей GPU-работы, копирование и загрузку. Не чистое время передачи.':'Прошедшее время на стороне CPU, включая вызовы драйвера и возможные ожидания. Не активная занятость CPU.'})
 }
 Object.defineProperty(target,KEY,{configurable:true,writable:true,value:hook})
 try{
  const result=await work(),wallMs=now()-origin
  if(stack.length)throw Error('CPU timeline unclosed span '+stack.at(-1)!.operation)
  const cores=tasks.filter(t=>t.operation==='core');if(cores.length!==1)throw Error('CPU timeline requires exactly one native core')
  const core=cores[0]!,inside=events.filter(e=>e.atMs>=core.startMs&&e.atMs<=core.endMs)
  const stageNames=['align.rawP','contrast.background','stitch.complete','front.rimPrepared','diffusion.complete','land.complete','background.reconstruct']
  const boundaries=[core.startMs];let after=core.startMs
  for(const stage of stageNames){const candidates=inside.filter(e=>e.stage===stage&&e.atMs>=after),event=candidates[stage==='background.reconstruct'?1:0];if(!event)throw Error('CPU timeline missing semantic boundary '+stage);boundaries.push(event.atMs);after=event.atMs}
  if(!inside.some(e=>e.stage==='dry.coverage'&&e.atMs>=after))throw Error('CPU timeline missing dry coverage')
  boundaries.push(core.endMs)
  const groups=groupIds.map((groupId,i):NativeCpuTask805=>({id:'cpu-group-'+groupId,operation:'group.'+groupId,parentId:core.id,groupId,label:groupLabels[i]!,lane:'cpu',clock:'host',wallAligned:true,startMs:boundaries[i]!,endMs:boundaries[i+1]!,elapsedMs:boundaries[i+1]!-boundaries[i]!,scope:'Непересекающийся host-интервал этого native core; GPU того же этапа имеет собственную длительность и выполняется асинхронно.'}))
  for(const task of tasks)if(task.parentId===core.id){const group=groups.find(g=>task.startMs>=g.startMs&&task.endMs<=g.endMs);if(group){task.parentId=group.id;task.groupId=group.groupId}}
  const top=tasks.filter(t=>!t.parentId).sort((a,b)=>a.startMs-b.startMs),gaps:NativeCpuTask805[]=[];let cursor=0,gap=0
  for(const task of [...top,{startMs:wallMs,endMs:wallMs}]){if(task.startMs>cursor)gaps.push({id:'host-overhead-'+gap++,operation:'host.overhead',label:'Обвязка между измеренными этапами',lane:'cpu',clock:'host',wallAligned:true,startMs:cursor,endMs:task.startMs,elapsedMs:task.startMs-cursor,scope:'Неразложенная обвязка QA: проверки, создание/чтение запросов, построение отчёта и JS-вызовы.'});cursor=Math.max(cursor,task.endMs)}
  return{result,cpuTimeline:{wallMs,completePipeline:true,clock:'performance.now',tasks:[...tasks,...groups,...gaps].sort((a,b)=>a.startMs-b.startMs||b.endMs-a.endMs),events,scope:'Один полный QA-вызов с source/output proof, native core, полным C-read и ответом GPU query. Все host offsets имеют общий origin. Brush/replay до вызова, показ в интерфейсе и построение самого отчёта не входят.',qualification:'Parent spans include children; never add both. CPU/transfer lanes are host elapsed intervals, not core utilization or isolated transfer bandwidth. GPU elapsed is independent and cannot be aligned to this origin from TIME_ELAPSED_EXT.'}}
 }finally{if(descriptor)Object.defineProperty(target,KEY,descriptor);else delete target[KEY]}
}
