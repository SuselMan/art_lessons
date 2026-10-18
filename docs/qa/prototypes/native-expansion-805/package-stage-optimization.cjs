'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),profiles=require('./profiles.json'),{build}=require('../native-anatomy-805/package-device-pipelines.cjs');
const median=a=>{const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2},sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pack(results,repeatResults,basePath,output){
 fs.mkdirSync(output,{recursive:true});const imageDir=path.join(output,'stage-images');fs.mkdirSync(imageDir,{recursive:true});
 function image(file,label){const bytes=fs.readFileSync(file),hash=sha(bytes),name=hash+'.png',to=path.join(imageDir,name);if(!fs.existsSync(to))fs.linkSync(file,to);return{src:'stage-images/'+name,sha256:hash,label,qualification:'Настоящий результат выбранного алгоритма на выбранном устройстве, не интерполяция и не картинка из другого варианта.'}}
 const base=JSON.parse(fs.readFileSync(basePath)),example=base.scenes[0],ids=new Set(),reports={},comparison={schemaVersion:1,title:'Ускорение этапов 4, 5 и 6',qualification:'Наша модель; каждый этап упрощён отдельно, есть сочетание. Вода фиксирована. Время — расчёт до полного чтения цвета, без пера и морфинга. CPU/GPU остановки сюда не добавлены.',byDevice:{}};
 const labels={'mini-two-colors':'Два цвета','gallery-sheet-3-slot-1':'Краска в воде','expansion-bridge':'Тонкая водная перемычка','expansion-dry-hole':'Сухое отверстие в луже'};
 for(const device of ['Samsung','Vega']){
  const versions=[];reports[device]={pass:true,closed:true,versions};const deviceDir=path.join(results,device);if(!fs.existsSync(deviceDir))throw Error('Missing device '+device);
  const scenes=[];comparison.byDevice[device]=scenes;
  for(const id of fs.readdirSync(deviceDir)){
   const rows=[];
   for(const arm of Object.keys(profiles)){
    const file=path.join(deviceDir,id,arm,'report.json');if(!fs.existsSync(file))throw Error('Incomplete case '+device+'/'+id+'/'+arm);let r=JSON.parse(fs.readFileSync(file));assert.equal(r.pass,true);assert.equal(r.closed,true);if(device==='Samsung'){assert.equal(r.powerBefore,'Awake');assert.equal(r.powerAfter,'Awake');assert.ok(r.frameGuard?.heartbeat?.count>3);assert.equal(r.frameGuard.visibility,'visible')}
    const second=path.join(repeatResults,device,id,arm,'report.json');if(fs.existsSync(second)){const b=JSON.parse(fs.readFileSync(second));assert.equal(b.pass,true);assert.deepEqual(b.warmup.sourceSHA,r.warmup.sourceSHA);assert.deepEqual(b.warmup.outputSHA,r.warmup.outputSHA);r={...r,natural:[...r.natural,...b.natural],synchronized:[...r.synchronized,...b.synchronized],repeatOrder:'forward then reverse'};}
    for(const [kind,record]of [['input',r.input],['goal',r.goal]])assert.equal(sha(fs.readFileSync(path.join(deviceDir,id,arm,kind+'.png'))),record.sha256);
    r.images={initial:image(path.join(deviceDir,id,arm,'input.png'),'До растекания'),final:image(path.join(deviceDir,id,arm,'goal.png'),profiles[arm].label)};
    r.medianMs=median(r.natural.map(s=>s.sample.totalToFullCMs));versions.push(r);rows.push(r)
   }
   for(const r of rows){const same=profiles[r.arm].expectedSameAs;if(same){const base=rows.find(x=>x.arm===same);assert.deepEqual(r.warmup.outputSHA,base.warmup.outputSHA,'Exact optimization changed '+device+'/'+id+'/'+r.arm);assert.equal(r.goal.sha256,base.goal.sha256,'Final native PNG differs for exact optimization')}}
   const baseline=rows.find(r=>r.arm==='smooth');assert.ok(baseline);const scene={id,label:labels[id]||id,input:baseline.images.initial,variants:[]};
   for(const r of rows){assert.deepEqual(r.warmup.sourceSHA,baseline.warmup.sourceSHA);assert.equal(r.input.sha256,baseline.input.sha256);const gain=100*(1-r.medianMs/baseline.medianMs),times=r.natural.map(s=>s.sample.totalToFullCMs);scene.variants.push({id:r.arm,label:profiles[r.arm].label,image:r.images.final,gpuMedianMs:null,wallMedianMs:r.medianMs,reportSHA256:sha(Buffer.from(JSON.stringify(r))),gpuSamples:0,wallSamples:r.natural.length,note:profiles[r.arm].note+' '+(r.arm==='smooth'?'База сравнения.':(gain>=0?'Быстрее на ':'Медленнее на ')+Math.abs(gain).toFixed(1)+'% относительно текущего быстрого в этой серии.')+' Диапазон '+Math.min(...times).toFixed(1)+'–'+Math.max(...times).toFixed(1)+' мс, '+times.length+' повторов.'})}scenes.push(scene);ids.add(id)
  }
  fs.writeFileSync(path.join(output,device+'-aggregate.json'),JSON.stringify(reports[device],null,2));
 }
 base.scenes=[...ids].map(id=>({...example,id,label:labels[id]||id}));const baseFile=path.join(output,'base.json');fs.writeFileSync(baseFile,JSON.stringify(base));
 const pipeline=build(baseFile,path.join(output,'Samsung-aggregate.json'),path.join(output,'Vega-aggregate.json'),output);
 fs.writeFileSync(path.join(output,'comparison-data.json'),JSON.stringify(comparison,null,2));
 let html=fs.readFileSync(path.join(__dirname,'compare.html'),'utf8').replace('<p id="device" class="note"></p>','<label>Устройство <select id="device-choice" style="font:inherit;min-height:44px"></select></label><p id="device" class="note"></p>');
 html=html.replace('<p id="device" class="note"></p>','<label>При удержании <select id="reference-choice" style="font:inherit;min-height:44px"><option value="original">Наш исходный</option><option value="smooth">Текущий быстрый</option></select></label><p id="device" class="note"></p>');html=html.replace("held?'original':","held?(window.__comparisonReference805||'original'):").replace("held?'Наш исходный алгоритм':","held?(window.__comparisonReference805==='smooth'?'Текущий быстрый':'Наш исходный алгоритм'):");
 const marker='{"schemaVersion":1,"scenes":[]}';html=html.replace(marker,JSON.stringify(comparison).replace(/</g,'\\u003c'));
 const start="try{const data=JSON.parse($('comparison-data').textContent);",end="}catch(error){$('error').hidden=false;";const at=html.indexOf(start),until=html.indexOf(end,at);assert.ok(at>0&&until>at);
 html=html.slice(0,at)+"try{const data=JSON.parse($('comparison-data').textContent);const choice=$('device-choice');for(const device of Object.keys(data.byDevice)){const o=el('option',device);o.value=device;choice.append(o)}function render(){const scenes=data.byDevice[choice.value];$('title').textContent=data.title;$('qualification').textContent=data.qualification;$('device').textContent=choice.value+' · одинаковый вход для всех вариантов';$('cards').replaceChildren(...scenes.map(card))}choice.onchange=render;$('reference-choice').onchange=()=>{window.__comparisonReference805=$('reference-choice').value};render()"+html.slice(until);
 fs.writeFileSync(path.join(output,'expansion.html'),html);
 return{devices:Object.keys(reports),cases:[...ids],profiles:Object.keys(profiles),combinations:pipeline.deviceVersions.length};
}
if(require.main===module)console.log(JSON.stringify(pack(...process.argv.slice(2))));module.exports={pack};
