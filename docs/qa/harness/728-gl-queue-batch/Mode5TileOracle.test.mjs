import {test} from 'node:test';import assert from 'node:assert/strict';import {coordinateProof,originalTexel,mode5Pixel,tileLoads} from './Mode5TileOracle.mjs';
test('actual1536 and odd/small dimensions have exact f32 nearest coordinates for strides1/2',()=>{for(const n of [1,2,3,5,7,13,31,63,127,511,1023,1536,1754,2480,4095,8191])for(const stride of [1,2])assert.equal(coordinateProof(n,stride).mismatches,0,JSON.stringify(coordinateProof(n,stride)))})
test('all64 lanes populate halo before masked outputs; Q8 same ordered sums including clamp/scissor borders',()=>{
 for(const [w,h] of [[1,1],[3,5],[13,7],[31,19],[1536,13]])for(const stride of [1,2]){
 const source=Uint8Array.from({length:w*h},(_,i)=>(i*73+19)%256);
 for(let by=0;by<h;by+=8)for(let bx=0;bx<w;bx+=8){const {tile,side,loads}=tileLoads(w,h,bx,by,stride,source);assert.equal(loads,side*side);
 for(let ly=0;ly<8;ly++)for(let lx=0;lx<8;lx++){let x=bx+lx,y=by+ly;if(x>=w||y>=h)continue;const direct=mode5Pixel((i,j)=>source[originalTexel(y,h,{tap:j,stride},{flip:true})*w+originalTexel(x,w,{tap:i,stride})]/255),cached=mode5Pixel((i,j)=>tile[(ly+stride-j*stride)*side+lx+stride+i*stride]);assert.equal(cached,direct);}
 }
 }
});
