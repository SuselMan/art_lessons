// AsyncFunction body. Presentation-independent canonical PNG comparison only.
// Input variable nativePNG is transferred base64; not a source/model oracle.
const dec=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const left=await createImageBitmap(new Blob([dec(nativePNG)],{type:'image/png'}));
const right=await createImageBitmap(await __engine.exportPNG(true));
if(left.width!==right.width||left.height!==right.height)throw Error('PNG dimensions differ');
const c=document.createElement('canvas');c.width=left.width;c.height=left.height;
const g=c.getContext('2d');g.drawImage(left,0,0);const a=g.getImageData(0,0,c.width,c.height).data;
g.clearRect(0,0,c.width,c.height);g.drawImage(right,0,0);const b=g.getImageData(0,0,c.width,c.height).data;
left.close();right.close();let pixels=0,max=0,total=0,above8=0,paintA=0,paintB=0;
for(let i=0;i<a.length;i+=4){let local=0;for(let k=0;k<4;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);local=Math.max(local,d);total+=d}if(local)pixels++;if(local>8)above8++;if(a[i+3])paintA++;if(b[i+3])paintB++;}
return{width:c.width,height:c.height,pixels,max,mean:total/a.length,above8,paintA,paintB,gl:__engine.gl.getError(),lost:__engine.gl.isContextLost()};
