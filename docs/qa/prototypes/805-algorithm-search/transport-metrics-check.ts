import {supportDistances,transportMetrics} from './transport-metrics'
const n=16,a=new Uint8Array(n*n*4);a[(5*n+4)*4+3]=100
const d=supportDistances(a,n).distanceSquared
for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(d[y*n+x]!==((x-4)**2+(y-5)**2))throw Error('Exact EDT failure')
const b=a.slice();b[(5*n+4)*4+3]=0;b[(5*n+14)*4+3]=100
const m=transportMetrics(a,b,n)
if(m.beyond[0].fraction!==1||m.rmsDistanceFromSupport!==10||m.alphaRatio!==1)throw Error('Transport oracle')
const empty=transportMetrics(new Uint8Array(n*n*4),new Uint8Array(n*n*4),n)
if(empty.supportPixels!==0||empty.rmsDistanceFromSupport!==0)throw Error('Empty oracle')
console.log(JSON.stringify({passed:3,exactDistanceCells:256}))
