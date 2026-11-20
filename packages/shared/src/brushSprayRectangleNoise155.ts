import{isBrushSpray}from'./brushSpray.js'
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const unit=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
/** Closed existing-noise consumer combination; no new wire field or noise law. */
export function hasSprayRectangleNoise155Scope(v:unknown):boolean{
 if(!obj(v)||v.version!==155||v.model!=='stamp'||v.paperInteraction!==0||!obj(v.tip)||!obj(v.behavior)||!isBrushSpray(v.spray))return false
 if(['mixer','scatter','wet','texture','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 const t=v.tip,b=v.behavior,s=v.spray,p=t.profile,n=t.autoNoise,r=b.rendering
 if(t.kind!=='procedural'||['mask','maskBounds','animation','color','material','imageSampling','autoShape'].some(k=>t[k]!==undefined)||!obj(p)||!obj(n)||n.version!==1||Object.keys(n).some(k=>!['version','density','randomness'].includes(k))||!unit(n.density)||!unit(n.randomness)||(n.density===1&&n.randomness===0))return false
 if(b.version!==2||b.erase===true||['dual','timing','softness','taper','wetMix','edgeBleed','grain','colorAdjustment','sequentialRandom','strokeInput','clockRead'].some(k=>b[k]!==undefined)||['dynamics','modulations'].some(k=>obj(b[k])&&(b[k]as Record<string,unknown>).softness!==undefined))return false
 if(!obj(r)||r.mode!=='buildUp'||r.blendMode!=='normal'||r.accumulation!=='directOver'||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0||r.gammaCorrect===true||r.luminance===true)return false
 if(s.particle.shape!=='tip'||s.particle.image!==undefined||s.particle.proportional!==false||['sourcePolicy','sampleInput','mixBackground','fillBackground'].some(k=>(s.color as unknown as Record<string,unknown>)[k]!==undefined))return false
 if(typeof p.antialias!=='boolean')return false
 if(p.kind==='gaussian2D')return Object.keys(p).every(k=>['kind','shape','horizontalFade','verticalFade','antialias'].includes(k))&&['ellipse','rectangle'].includes(String(p.shape))&&unit(p.horizontalFade)&&unit(p.verticalFade)
 return p.kind==='curveRectangle'&&Object.keys(p).every(k=>['kind','lookup','resolution','encoding','antialias'].includes(k))&&typeof p.lookup==='string'&&/^asset:[a-f0-9]{64}$/.test(p.lookup)&&Number.isInteger(p.resolution)&&Number(p.resolution)>=1&&Number(p.resolution)<=40000&&p.encoding==='unorm32be'
}
