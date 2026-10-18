'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {normalizeScene}=require('../../harness/805-algorithm-search/gallery-normalize.cjs');
const root=path.resolve(__dirname,'../../runs/805-night-20261017');
function fixtures(){
 const gallery=JSON.parse(fs.readFileSync(path.join(root,'gallery-scenes-source.json'))).scenes;
 const mini=JSON.parse(fs.readFileSync(path.join(root,'mini-scenes-source.json'))).scenes;
 const waterSource=gallery.find(s=>s.id==='gallery-sheet-3-slot-1');
 assert.equal(waterSource.operations[0].preset,'normal:100:0:PB29:chisel');
 function op(template,id,points){
  const original=Buffer.from(template.dabsPacked.slice(2),'base64'),mid=Math.floor(original.length/40/2)*40;
  const bytes=Buffer.alloc(points.length*40);
  points.forEach(([x,y,size],i)=>{assert.ok(x>0&&x<1024&&y>0&&y<1024&&size>0);original.copy(bytes,i*40,mid,mid+40);[x,y,.9,0,0,size,1,0,.99,i*16].forEach((v,j)=>bytes.writeFloatLE(v,i*40+j*4))});
  return{...template,id,strokeId:id,dabsPacked:'1:'+bytes.toString('base64')};
 }
 function synthetic(id,label,water,pigment){
  const scene=normalizeScene({id,label,operations:[op(waterSource.operations[0],id+'-water',water),op(waterSource.operations[1],id+'-paint',pigment)]});
  return{...scene,synthetic:true,qualification:'Синтетическая геометрия, тот же настоящий native brush/replay. Размеры штампов/XY/нажим/наклон заданы явно; это тест препятствия, не запись из галереи.'};
 }
 const bridge=[[300,512,280],[724,512,280],...Array.from({length:45},(_,i)=>[300+i*424/44,512,32])];
 const ring=Array.from({length:100},(_,i)=>{const a=i/100*Math.PI*2;return[512+220*Math.cos(a),512+220*Math.sin(a),90]});
 return[
  {...normalizeScene(mini.find(s=>s.id==='mini-two-colors')),synthetic:false},
  {...normalizeScene(waterSource),synthetic:false},
  synthetic('expansion-bridge','Узкая мокрая перемычка',bridge,[[420,512,70]]),
  synthetic('expansion-dry-hole','Сухое отверстие внутри лужи',ring,[[292,512,70]])
 ];
}
if(require.main===module)console.log(JSON.stringify(fixtures(),null,2));
module.exports={fixtures};
