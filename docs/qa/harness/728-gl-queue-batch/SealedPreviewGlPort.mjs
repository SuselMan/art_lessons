/** OFF QA preview. Calls shipped material diffusion, never RGB blur or canonical outputs.
 * Initial reduction uses shipped resample mode0: four samples, NOT an 8x8 area mean.
 * This explicit display approximation must pass faint-dab/shape gates before wiring.
 */
export class SealedPreviewGlPort {
 constructor(passes,{world={x:0,y:0,width:1024,height:1024},paperWidth,paperHeight}={}) {
  if(world.width!==1024||world.height!==1024||!Number.isFinite(world.x)||!Number.isFinite(world.y)||!(paperWidth>0&&paperHeight>0)) throw Error('Explicit preview world/paper contract')
  this.passes=passes;this.world=Object.freeze({...world});this.paperWidth=paperWidth;this.paperHeight=paperHeight;this.stats={initializations:0,steps:0,draws:0,pixels:0}
 }
 initialize(record) {
  // No writes to source: only reserved visual destinations. The canonical source
  // and original material remain the authoritative high-resolution endpoint.
  const pairs=[[record.out.p,record.source.pigmentLoad],[record.out.c,record.source.colourLoad],[record.out.water,record.source.solventLoad],[record.out.coverage,record.source.coverage]]
  for(const [out,src] of pairs){if(out.texture===src.texture)throw Error('Readonly preview initialization alias');this.passes.wcResample(out,0,0,128,128,src,0,0,8,0)}
  this.stats.initializations++;this.stats.draws+=4;this.stats.pixels+=4*128*128
 }
 step(ticket) {
  const all=[ticket.p,ticket.c,ticket.outP,ticket.outC,ticket.water,ticket.coverage]
  if(new Set(all.map(f=>f.texture)).size!==all.length||all.some(f=>f.width!==128||f.height!==128))throw Error('Preview transport feedback/dimensions')
  const field={w:128,h:128,coverage:ticket.coverage}
  // S=8 maps preview texels to WORLD units. paperOrigin=(x/8,-(y/8+128)),
  // paperSize=(paperWidth/8,paperHeight/8): the production transform cancels S.
  // Nearest king radius1 only. Both P/C use unchanged coverage + paper and
  // unchanged OLD P/C; two writes do not become inputs until caller completes.
  for(const [src,out] of [[ticket.p,ticket.outP],[ticket.c,ticket.outC]])
   this.passes.diffuseStep(field,this.world.x,this.world.y,8,this.paperWidth,this.paperHeight,src,out,8,false,ticket.coverage)
  this.stats.steps++;this.stats.draws+=2;this.stats.pixels+=2*128*128
 }
}
