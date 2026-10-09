/** Explicit QA observer. Captures scalars/identities before the ORIGINAL encode;
 * no texture read, hashing, allocation or queue operation is added. */
export function installFrontOperandCapture(Adapter, options) {
  if (options.enabled !== true) return {read: () => null, restore() {}}
  if (options.dev !== true || typeof options.active !== 'function') throw Error('DEV active window required')
  for (const key of ['paperSHA','noiseSHA','sourceSHA']) if (!/^[a-f0-9]{64}$/.test(options[key] ?? '')) throw Error('Exact input/source SHA required')
  const prototype=Adapter.prototype, original=prototype.waterFrontStep
  if (typeof original!=='function') throw Error('Original front producer required')
  const identities=new WeakMap();let nextIdentity=1, snapshot=null, calls=0, restored=false
  const identity=value=>{if (!value || (typeof value!=='object'&&typeof value!=='function')) throw Error('Immutable resource identity missing');if(!identities.has(value))identities.set(value,nextIdentity++);return identities.get(value)}
  function wrapped(field,x0,y0,dryCost,source,out,costMax,climb,floor,stride=1,scale=1,foreignWater=null) {
    if (options.active() && climb===30 && stride===1) {
      if(calls>=216)throw Error('Bounded first outer-front capture exceeded')
      const owner=this.owner, paper=owner?.paper, noise=owner?.noise
      if(!paper||!noise)throw Error('Actual owner static resources required')
      const current={width:field.w,height:field.h,sourceWidth:source.width,sourceHeight:source.height,outWidth:out.width,outHeight:out.height,x0,y0,scale,
        paperOrigin:[x0/scale,-(y0/scale+field.h)],paperTexSize:[paper.texSize[0]/scale,paper.texSize[1]/scale],paperScale:paper.scale,
        paperTextureWidth:paper.field.width,paperTextureHeight:paper.field.height,noiseWidth:noise.width,noiseHeight:noise.height,
        dryCost,costMax,climb,floor,stride,foreignWet:foreignWater?1:0,
        deviceIdentity:identity(owner.device),paperIdentity:identity(paper.field.texture),noiseIdentity:identity(noise.texture),
        paperSHA:options.paperSHA,noiseSHA:options.noiseSHA,sourceSHA:options.sourceSHA}
      const numeric=[current.width,current.height,current.sourceWidth,current.sourceHeight,current.outWidth,current.outHeight,current.paperTextureWidth,current.paperTextureHeight,current.noiseWidth,current.noiseHeight,current.x0,current.y0,current.scale,...current.paperOrigin,...current.paperTexSize,current.paperScale,dryCost,costMax,climb,floor,stride]
      if(!numeric.every(Number.isFinite)||current.width<=0||current.height<=0||scale<=0)throw Error('Invalid actual scalar operands')
      if(![current.width,current.height,current.sourceWidth,current.sourceHeight,current.outWidth,current.outHeight,current.paperTextureWidth,current.paperTextureHeight].every(v=>Number.isInteger(v)&&v>0)||current.sourceWidth!==current.width||current.sourceHeight!==current.height||current.outWidth!==current.width||current.outHeight!==current.height||noise.width!==251||noise.height!==251)throw Error('Actual operand dimensions mismatch')
      if(snapshot && JSON.stringify(snapshot)!==JSON.stringify(current))throw Error('Selected outer-front operands changed')
      snapshot??=current;calls++
    }
    return original.apply(this,arguments)
  }
  prototype.waterFrontStep=wrapped
  return {read:()=>snapshot?JSON.parse(JSON.stringify({operands:snapshot,calls,scope:'Actual first selected outer front, CPU scalar metadata only'})):null,
    restore(){if(restored)return;restored=true;if(prototype.waterFrontStep!==wrapped)throw Error('Front observer ownership changed');prototype.waterFrontStep=original}}
}
