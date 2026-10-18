const {test}=require('node:test'),assert=require('node:assert/strict'),{grid,exchanges}=require('./grid.cjs');
test('every internal halo texel receives exactly one neighbouring core, including corners and narrow last tiles',()=>{
 for(const [w,h,size] of [[37,29,8],[3508,2480,1024],[1024,1024,256]]){
 const tiles=grid(w,h,size),copies=exchanges(tiles);
 for(let d=0;d<tiles.length;d++){const t=tiles[d],seen=new Set();for(const c of copies.filter(c=>c.dst===d)){const s=tiles[c.src];for(let yy=0;yy<c.h;yy++)for(let xx=0;xx<c.w;xx++){const x=c.dx+xx,y=c.dy+yy,key=x+','+y;assert(!seen.has(key));seen.add(key);assert.equal(s.x+c.sx+xx-s.halo,t.x+x-t.halo);assert.equal(s.y+c.sy+yy-s.halo,t.y+y-t.halo);assert(x<t.halo||y<t.halo||x>=t.halo+t.w||y>=t.halo+t.h);}}
 for(let y=0;y<t.h+4;y++)for(let x=0;x<t.w+4;x++){if(x>=2&&y>=2&&x<t.w+2&&y<t.h+2)continue;const wx=t.x+x-2,wy=t.y+y-2;assert.equal(seen.has(x+','+y),wx>=0&&wy>=0&&wx<w&&wy<h);}}
 }
});
