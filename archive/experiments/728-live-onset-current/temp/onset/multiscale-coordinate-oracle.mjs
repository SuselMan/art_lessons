import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root='/home/suselman/projects/pencil-agents/680-water-wet-tone';
const shader=execFileSync('git',['-C',root,'show','7b11b29e:apps/web/src/engine/src/raster/shaders.ts'],{encoding:'utf8'});
const passes=execFileSync('git',['-C',root,'show','7b11b29e:apps/web/src/engine/src/raster/WatercolorPasses.ts'],{encoding:'utf8'});
assert(shader.includes('u_dir * (3.0 / max(u_origin.x, 1.0))'));
assert(shader.includes('uvj + wcCarryDir(mm) * u_dir'));
assert(passes.includes('opts.dir[0] / out.width'));
assert(shader.includes('float(p) / u_origin.x'));
// Enumerates the current shader's sampled coordinates, not shader transport or mass.
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
function reads(s){
 const points=[];const add=(x,y)=>points.push([x,y]);add(0,0);
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)add(x*3,y*3); // u_dir*s, 3/u_origin =>3px
 for(const [dx,dy] of dirs){
  const x=dx*s,y=dy*s;add(x,y);
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)add(x+i*3,y+j*3);
  for(const [ex,ey]of dirs){add(x+ex*s,y+ey*s);for(let p=1;p<8;p++)if(p<s)add(x+ex*p,y+ey*p);}
 }
 return points;
}
function bound(s){return Math.max(2*s,s+3)+1} // one conservative LINEAR guard texel
function prefix(strides,margin){let radius=0;const out=[];for(const s of strides){if(radius+s+bound(s)>margin)break;radius+=s;out.push(s)}return {out,radius};}
for(const s of [1,2,4,8,16,32,64]){
 const max=Math.max(...reads(s).flat().map(Math.abs));assert.equal(max,Math.max(2*s,s+3));assert(max<bound(s));
 // Every sample from the potentially changed support is interior to the crop.
 const M=s+bound(s);for(let x=-s;x<=s;x++)for(let y=-s;y<=s;y++)for(const [dx,dy]of reads(s)){assert(Math.abs(x+dx)<M);assert(Math.abs(y+dy)<M)}
}
const schedule=[1,2,4,8,16,32,64,64,32,16,8,4,2,1];
assert.deepEqual(prefix(schedule,97),{out:[1,2,4,8,16],radius:31});
assert.deepEqual(prefix(schedule,4),{out:[],radius:0});assert.deepEqual(prefix(schedule,6),{out:[1],radius:1});
// Prefix never leaps past the first unsafe operator, even if a later fine step fits.
assert.deepEqual(prefix([1,32,1],10).out,[1]);
for(let M=0;M<200;M++){const p=prefix(schedule,M);assert.deepEqual(p.out,schedule.slice(0,p.out.length));assert(p.radius<=M)}
console.log('Coordinate dependency oracle PASS; no transport/pixel/mass claim. Margin97 admits ordered1/2/4/8/16 prefix, no32.');
