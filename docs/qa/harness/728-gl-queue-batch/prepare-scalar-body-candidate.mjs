import fs from 'node:fs';import {createHash}from'node:crypto';
const source='apps/web/src/engine/src/dabs/markerRibbon.ts',out='temp/device-runs/markerRibbonScalar.ts';let text=fs.readFileSync(source,'utf8'),original=text;
for(const [name,group,index]of [['r0','rim','i'],['r1','rim','j'],['c0','core','i'],['c1','core','j']]){
 const from=`const ${name} = { x: centre.x + ${group}[${index}].x, y: centre.y + ${group}[${index}].y }`,to=`const ${name}x = centre.x + ${group}[${index}].x, ${name}y = centre.y + ${group}[${index}].y`;
 if(text.split(from).length!==2)throw Error('Scalar body seam changed');text=text.replace(from,to).replaceAll(name+'.x',name+'x').replaceAll(name+'.y',name+'y');
}
fs.writeFileSync(out,text);const sha=x=>createHash('sha256').update(x).digest('hex');fs.writeFileSync('temp/device-runs/scalar-body-passport.json',JSON.stringify({source,sourceSHA:sha(original),candidateSHA:sha(text),productionModified:false,removedObjectsPerBody:64},null,2));
