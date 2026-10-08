import type {CanonicalDrawCommand} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
/** CPU-only diagnostic bounds of actual captured coverage commands. No recooked dabs/doses. */
export function sourceCommandManifest(commands:readonly CanonicalDrawCommand[]){
 return commands.map((command,index)=>{
  if(command.kind==='stamp'){
   const s=command.stamp,[ox,oy]=s.uniforms.worldOrigin,c=Math.cos(s.angle),n=Math.sin(s.angle),a=s.radius*s.aspect,b=s.radius
   // Conservative rotated-quad support. Fragment clipping can make support smaller.
   const hx=Math.abs(a*c)+Math.abs(b*n),hy=Math.abs(a*n)+Math.abs(b*c),x=s.center[0]+ox,y=s.center[1]-oy
   return{index,kind:command.kind,bounds:[x-hx,y-hy,x+hx,y+hy],stamp:s}
  }
  const v=command.batch.vertices
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity
  for(let i=0;i<v.length;i+=11){x0=Math.min(x0,v[i]);y0=Math.min(y0,v[i+1]);x1=Math.max(x1,v[i]);y1=Math.max(y1,v[i+1])}
  return{index,kind:command.kind,bounds:[x0,y0,x1,y1],vertexCount:v.length/11,uniforms:command.batch.uniforms}
 })
}
