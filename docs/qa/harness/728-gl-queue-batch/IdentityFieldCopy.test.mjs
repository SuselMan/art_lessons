import {test} from 'node:test';import assert from 'node:assert/strict';
import {identityCopyRect,encodeIdentityCopy,referenceQ8} from './IdentityFieldCopy.mjs';
const base={mode:1,k:0,width:8,height:6,sourceWidth:8,sourceHeight:6,format:'rgba8unorm',nearest:true,validated:true};
test('every Q8 value and signed zero preserves all channels including invisible RGB',()=>{
 for(const k of [0,-0])for(let i=0;i<256;i++)for(let j=0;j<256;j++){
 const a=[i,255-i,j,0],b=[j,i,255-j,255];assert.deepEqual(referenceQ8(a,b,k),a);
 }
});
test('integer GL scissor copies exactly the matching top-down rectangle, leaving other bytes intact',()=>{
 const rect=identityCopyRect({...base,scissor:[2,1,3,2]});assert.deepEqual(rect,{origin:[2,3,0],size:[3,2,1]});
 const src=Uint8Array.from({length:8*6*4},(_,i)=>i%256),dst=new Uint8Array(src.length).fill(199),original=dst.slice();let calls=0;
 encodeIdentityCopy({copyTextureToTexture:(s,d,size)=>{calls++;assert.equal(s.texture,src);assert.equal(d.texture,dst);for(let y=s.origin[1];y<s.origin[1]+size[1];y++)for(let x=s.origin[0];x<s.origin[0]+size[0];x++)dst.set(src.subarray((y*8+x)*4,(y*8+x)*4+4),(y*8+x)*4);}},src,dst,rect);
 assert.equal(calls,1);for(let y=0;y<6;y++)for(let x=0;x<8;x++){let p=(y*8+x)*4;assert.deepEqual(dst.slice(p,p+4),(x>=2&&x<5&&y>=3&&y<5?src:original).slice(p,p+4));}
 assert.throws(()=>encodeIdentityCopy({},src,src,rect),/alias/);
});
test('unsafe variants fall back without touching GPU',()=>{
 for(const change of [{validated:false},{mode:5},{k:1},{worldZ:1},{nearest:false},{format:'rgba32float'},{sourceWidth:7},{scissor:[.1,0,2,2]},{scissor:[0,0,9,6]}])assert.equal(identityCopyRect({...base,...change}),null);
});
