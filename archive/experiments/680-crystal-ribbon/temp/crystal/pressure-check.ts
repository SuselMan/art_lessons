import assert from 'node:assert/strict';
import {buildRibbonBands,RIBBON_FLOATS_PER_VERTEX as N} from '../../apps/web/src/engine/src/dabs/markerRibbon';
const a={x:0,y:0,size:100,pressure:.8,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0};
const b={...a,x:120,size:150,pressure:.2};let count=0;
const bands=buildRibbonBands([a,b],1);for(let i=0;i<bands.length;i+=N){const x=bands[i];if(x<=0||x>=120||bands[i+5]!==0||bands[i+2]<10)continue;count++;assert(Math.abs(bands[i+9]-(.8-.6*x/120))<1e-6)}assert(count>0);console.log({interiorVertices:count,passed:true});
