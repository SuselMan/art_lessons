(function(root){
'use strict';
function validate(data){
 const fail=m=>{throw new Error(m)},hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(data?.schemaVersion!==1||!Array.isArray(data.scenes))fail('Неподдерживаемый формат схемы');
 if(data.optimization!==undefined){if(!Array.isArray(data.optimization.cases))fail('Неверное резюме оптимизации');for(const row of data.optimization.cases){if(typeof row.label!=='string'||typeof row.scope!=='string')fail('Нет границы замера оптимизации');for(const key of ['baselineMs','optimizedMs'])if(row[key]!==undefined&&(!Number.isFinite(row[key])||row[key]<0))fail('Неверное время оптимизации');if(row.sameOutput!==undefined&&typeof row.sameOutput!=='boolean')fail('Неверное подтверждение совпадения');}}
 const scenes=new Set();
 for(const scene of data.scenes){
  if(typeof scene.id!=='string'||scenes.has(scene.id))fail('Повтор или отсутствие сцены');scenes.add(scene.id);
  if(!Array.isArray(scene.tracks))fail('Нет уровней схемы');
  const stages=new Set(),tracks=new Set();
  for(const track of scene.tracks){
   if(!['native','qa'].includes(track.id)||tracks.has(track.id)||!Array.isArray(track.stages))fail('Неверный уровень');tracks.add(track.id);
   for(const stage of track.stages){
    if(typeof stage.id!=='string'||stages.has(stage.id))fail('Повтор или отсутствие этапа');stages.add(stage.id);
    for(const name of ['label','inputText','actionText','outputText'])if(typeof stage[name]!=='string')fail('Нет описания этапа: '+name);
    for(const image of [stage.beforeImage,stage.afterImage].filter(Boolean))checkImage(image);
    for(const t of stage.timings||[]){
     if(!Number.isFinite(t.valueMs)||t.valueMs<0||!['cpu-host','gpu-timestamp','wall'].includes(t.clock)||typeof t.scope!=='string'||typeof t.seriesId!=='string')fail('Неверное измерение');
     if(!['interval','cumulative','estimated-difference'].includes(t.kind||'interval'))fail('Неверный тип времени');
     if(t.kind==='estimated-difference'&&!t.qualification)fail('Оценка разности требует пояснения');
    }
   }
  }
  if(scene.initial)checkImage(scene.initial);
  if(scene.final)checkImage(scene.final);
  if(scene.sameFinalTargetSHA!==undefined&&!hash(scene.sameFinalTargetSHA))fail('Неверный SHA конечного материала');
 }
 function checkImage(image){if(!hash(image.sha256)||!['field','paint-preview','material-preview'].includes(image.kind)||typeof image.src!=='string'||!image.src||/^(?:javascript:|data:|https?:|\/\/)/i.test(image.src)||image.src.split('/').includes('..'))fail('Неверный снимок');}
 return data;
}
function timingLabel(t){
 const value=timeValue(t,2);
 const kind=t.kind==='cumulative'?'Накопленное время':t.kind==='estimated-difference'?'Оценка разности':'Отдельный интервал';
 const clock={'cpu-host':'CPU / вызов на хосте','gpu-timestamp':'GPU timestamp',wall:'Полное прошедшее время'}[t.clock];
 return kind+': '+value+' · '+clock+(t.observation?' · наблюдение':'');
}
function timeValue(t,digits){const below=Number.isFinite(t.timerResolutionMs)&&t.timerResolutionMs>0&&t.valueMs<t.timerResolutionMs;return (below?'< ':'')+(below?t.timerResolutionMs:t.valueMs).toLocaleString('ru-RU',{maximumFractionDigits:digits})+' мс'}
function shortTiming(t){const kind=t.kind==='cumulative'?'накоплено':t.kind==='estimated-difference'?'оценка':{'cpu-host':'CPU','gpu-timestamp':'GPU','wall':'прошло'}[t.clock];return timeValue(t,2)+' · '+kind+(t.observation?' · наблюдение':'')}
const api={validate,timingLabel,shortTiming};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.NativeAnatomyModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
