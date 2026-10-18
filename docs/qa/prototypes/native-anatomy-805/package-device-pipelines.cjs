'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const GPU_GROUPS_805=['ungrouped','prepare','selection','paths','transport','assemble','background','protect'];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
function build(basePath,samsungPath,vegaPath,output){
 const data=JSON.parse(fs.readFileSync(basePath));data.deviceVersions=[];data.title='Расчёт растекания: Samsung и Vega';data.note='Исходный и быстрый расчёты на одинаковом записанном мазке. Обычный прогон и поэтапный контроль разделены.';delete data.overview;
 for(const [device,file]of [['Samsung',samsungPath],['Vega',vegaPath]]){
  const report=JSON.parse(fs.readFileSync(file));assert.equal(report.pass,true);assert.equal(report.closed,true);
  assert.deepEqual(report.versions[0].warmup.sourceSHA,report.versions[1].warmup.sourceSHA,'Algorithms must receive identical source');for(const v of report.versions){assert.equal(v.natural.length,3);assert.equal(v.synchronized.length,3);for(const row of [...v.natural,...v.synchronized]){assert.equal(row.sourceUnchanged,true);assert.deepEqual(row.sourceSHA,row.sourceSHAAfter);assert.deepEqual(row.sourceSHA,v.warmup.sourceSHA);assert.deepEqual(row.outputSHA,v.warmup.outputSHA);assert.equal(row.sample.glError,0)}
   const naturalMedian=median(v.natural.map(r=>r.sample.totalToFullCMs));const versions={device,version:v.arm,label:device+' · '+(v.arm==='original'?'наш исходный':'быстрый расчёт')};
   for(const method of ['natural','synchronized']){
    const rows=v[method],row=[...rows].sort((a,b)=>a.sample.totalToFullCMs-b.sample.totalToFullCMs)[1],core=row.cpuTimeline.tasks.find(t=>t.operation==='core'),read=row.cpuTimeline.tasks.find(t=>t.operation==='output.c-read');assert.ok(core&&read);assert.ok(Math.abs(core.elapsedMs+read.elapsedMs-row.sample.totalToFullCMs)<1);
    versions[method]={...row.cpuTimeline,method,repeat:rows.indexOf(row)+1,nativeReadyMs:row.sample.totalToFullCMs,nativeWindow:{startMs:core.startMs,endMs:read.endMs},diagnosticOnlyMs:row.cpuTimeline.wallMs-row.sample.totalToFullCMs,tasks:row.cpuTimeline.tasks,gpuIntervals:method==='natural'?GPU_GROUPS_805.map(id=>({id,unmeasured:true})):row.gpu.intervals.map(r=>({...r,elapsedMs:r.boundaryWaitMs,scope:'Ожидание зависимого пикселя выходных карт. Включает GPU и передачу. Не чистое время шейдеров.'})),summary:'Обычный расчёт: медиана '+naturalMedian.toFixed(1)+' мс; диапазон '+Math.min(...v.natural.map(r=>r.sample.totalToFullCMs)).toFixed(1)+'–'+Math.max(...v.natural.map(r=>r.sample.totalToFullCMs)).toFixed(1)+' мс (3 прогона после прогрева). '+(method==='synchronized'?'Ниже отдельный поэтапный контроль с остановками.':'Ниже целый реальный прогон, ближайший к медиане.')+' Без ввода пера, морфинга и показа на экране.',qualification:method==='natural'?'Измерены CPU-вызовы и полное ожидание конечного цвета. Отдельное время GPU-этапов не подставляется из другого прогона.':'После каждого этапа читаем 1 пиксель из каждой его выходной карты. Барьеры меняют исполнение; использовать для поиска дорогих этапов, не как обычное время отклика.',evidence:{report:path.basename(file),sourceSHA:row.sourceSHA,outputSHA:row.outputSHA,profile:v.arm}};
   }data.deviceVersions.push(versions);
  }
 }
 for(const scene of data.scenes){scene.label=scene.id==='mini-two-colors'?'Два цвета':scene.label;if(scene.final)scene.final.qualification='Иллюстрация: результат исходного алгоритма на Vega из предыдущего диагностического прогона; не снимок выбранного замера.';}
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'data.json'),JSON.stringify(data,null,2));let html=fs.readFileSync(path.join(__dirname,'steps.html'),'utf8').replace('{"schemaVersion":1,"scenes":[]}',JSON.stringify(data).replace(/</g,'\\u003c'));fs.writeFileSync(path.join(output,'anatomy.html'),html);return data;
}
if(require.main===module)build(...process.argv.slice(2));module.exports={build};
