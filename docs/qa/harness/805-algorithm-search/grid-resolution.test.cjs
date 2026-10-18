'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../../prototypes/805-algorithm-search/compare.html'),'utf8');
const begin=source.indexOf('function gridText(v)'),end=source.indexOf('\nfunction result(v)',begin);assert.ok(begin>=0&&end>begin);const gridText=vm.runInNewContext('('+source.slice(begin,end)+')');
test('coarse transport, fine local stage and output stay distinct',()=>assert.equal(gridText({gridResolution:{transportGrid:128,localFineGrid:1024,fineSteps:4,outputSize:1024}}),'Перенос 128×128 · Локальная детализация 1024×1024 (4 шагов обмена) · Результат 1024×1024'));
test('fine zero is initialization only, never claims fine transport',()=>assert.match(gridText({gridResolution:{transportGrid:128,localFineGrid:1024,fineSteps:0,outputSize:1024}}),/без шагов обмена/));
test('missing or untrusted dimensions never inferred from image/config',()=>{assert.match(gridText({image:'1024.png',config:{grid:128}}),/не сохранён/);assert.equal(gridText({gridResolution:{unknown:true,transportGrid:-1,outputSize:'1024'}}),'Сетка переноса не сохранена · Размер результата не сохранён')});
