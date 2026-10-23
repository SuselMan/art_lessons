import fs from 'node:fs';
import ts from 'typescript';
const path='apps/web/src/engine/index.ts', src=fs.readFileSync(path,'utf8');
fs.writeFileSync('temp/494-layer-compositor/before.ts',src);
const sf=ts.createSourceFile(path,src,ts.ScriptTarget.Latest,true);
const cls=sf.statements.find(x=>ts.isClassDeclaration(x)&&x.name?.text==='PencilEngine');
const names=['_compositeTextures','_invalidateSplitCache','_drawCompositeItem','_rebuildSplitCacheIfDirty','_rebuildCacheHalf','_downsampleTileInto','_drawTileComposite','_runComposite'];
const rename=Object.fromEntries(names.map(n=>[n,n.slice(1)]));
const map={ 'this._previews':'this.ctx.previews()', 'this._layers':'this.ctx.layers()', 'this._washReveals':'this.ctx.reveals()', 'this._drawTileReveal':'this.ctx.drawReveal', 'this._screenBuf':'this.ctx.screenBuf()', 'this._assemblyFBO':'this.ctx.assembly()', 'this._belowCache':'this.ctx.below()', 'this._aboveCache':'this.ctx.above()', 'this._activeId':'this.ctx.activeId()', 'this.gl':'this.ctx.gl' };
for(const [a,b] of Object.entries(rename)) map['this.'+a]='this.'+b;
const rewrite=s=>Object.entries(map).sort((a,b)=>b[0].length-a[0].length).reduce((s,[a,b])=>s.replaceAll(a,b),s).replaceAll('const { gl } = this','const { gl } = this.ctx');
const methods=names.map(n=>{const m=cls.members.find(m=>m.name?.getText(sf)===n);return rewrite(src.slice(m.getFullStart(),m.end)).replace('private '+n,n.slice(1));});
const types=sf.statements.filter(x=>ts.isInterfaceDeclaration(x)&&['CompositeItem','WashReveal'].includes(x.name.text));
const header=`// Layer composition and split-cache invalidation. GPU buffers remain owned by
// the engine and are read through the context after resize/context restore.
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { coarseFactorFor } from '../buffers/tileMath'
import { frameEdgeX, frameEdgeY, type CameraFrame } from './cameraFrame'
import type { LayerPreviews } from './layerPreviews'
import { DISPLAY_VERT, LAYER_COMPOSITE_FRAG } from './shaders'
import { createProgram, getUniforms } from './utils'

${types.map(t=>src.slice(t.getFullStart(),t.end).replace(/(?<!export )interface /,'export interface ')).join('\n')}

export interface LayerCompositorContext {
  readonly gl: WebGLRenderingContext
  screenBuf(): WebGLBuffer
  layers(): ReadonlyMap<string, ILayerBuffer>
  previews(): LayerPreviews
  reveals(): ReadonlyMap<AccumulationBuffer, WashReveal>
  drawReveal(frame: CameraFrame, reveal: WashReveal, texture: WebGLTexture, originX: number, originY: number, bw: number, bh: number, opacity: number, targetFbo: WebGLFramebuffer, targetW: number, targetH: number, minifying: boolean): void
  activeId(): string | null
  assembly(): AccumulationBuffer
  below(): AccumulationBuffer
  above(): AccumulationBuffer
}

export class LayerCompositor {
  private readonly ctx: LayerCompositorContext
  private _compositeProg!: WebGLProgram
  private _compositeUni!: Record<string, WebGLUniformLocation | null>
  private _compositePosLoc!: number
  private _splitCacheDirty = true
  constructor(ctx: LayerCompositorContext) { this.ctx = ctx }
  // Separate stages keep the engine's existing GL initialization order.
  initProgram(): void { this._compositeProg = createProgram(this.ctx.gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG) }
  initUniforms(): void { this._compositeUni = getUniforms(this.ctx.gl, this._compositeProg, ['u_layer', 'u_opacity']) }
  initAttributes(): void { this._compositePosLoc = this.ctx.gl.getAttribLocation(this._compositeProg, 'a_position') }
`;
fs.writeFileSync('apps/web/src/engine/src/raster/LayerCompositor.ts',header+methods.join('\n')+'\n}\n');
const edits=[];
for(const n of names){const m=cls.members.find(m=>m.name?.getText(sf)===n);const internal=['_rebuildSplitCacheIfDirty','_rebuildCacheHalf'].includes(n);const args=m.parameters.map(p=>p.name.getText(sf)).join(', ');const signature=src.slice(m.getStart(sf),m.body.pos);edits.push({a:m.getFullStart(),b:m.end,s:internal?'':`\n  /** Delegates layer composition to LayerCompositor. */\n  ${signature}{ this._compositor.${rename[n]}(${args}) }`});}
for(const m of cls.members)if(['_compositeProg','_compositeUni','_compositePosLoc','_splitCacheDirty'].includes(m.name?.getText(sf))) edits.push({a:m.getFullStart(),b:m.end,s:''});
for(const t of types)edits.push({a:t.getFullStart(),b:t.end,s:''});
let out=src;for(const e of edits.sort((a,b)=>b.a-a.a))out=out.slice(0,e.a)+e.s+out.slice(e.b);
out="import { LayerCompositor, type CompositeItem, type WashReveal } from './src/raster/LayerCompositor'\nexport type { CompositeItem } from './src/raster/LayerCompositor'\n"+out;
out=out.replace('DISPLAY_VERT, PAPER_COMPOSE_FRAG, LAYER_COMPOSITE_FRAG,','DISPLAY_VERT, PAPER_COMPOSE_FRAG,').replace('TILE_SIZE, coarseFactorFor','TILE_SIZE');
out=out.replace('this._compositeProg       = createProgram(gl, DISPLAY_VERT, LAYER_COMPOSITE_FRAG)','this._compositor.initProgram()').replace("this._compositeUni = getUniforms(gl, this._compositeProg, ['u_layer', 'u_opacity'])",'this._compositor.initUniforms()').replace("this._compositePosLoc      = gl.getAttribLocation(this._compositeProg, 'a_position')",'this._compositor.initAttributes()').replaceAll('this._splitCacheDirty = true','this._compositor.invalidateSplitCache()');
const bridge=`  // Layer composition reads the current buffers on every call: resize and
  // context restore replace their GL handles without changing this owner.
  private readonly _compositor = new LayerCompositor({
    get gl() { return engine.gl },
    screenBuf: () => this._screenBuf,
    layers: () => this._layers,
    previews: () => this._previews,
    reveals: () => this._washReveals,
    drawReveal: (...args) => this._drawTileReveal(...args),
    activeId: () => this._activeId,
    assembly: () => this._assemblyFBO,
    below: () => this._belowCache,
    above: () => this._aboveCache,
  })
`;
// Use the same GL object throughout the lifetime, including context restore;
// a getter arrow cannot use lexical this in an object getter, so create the
// context inside a tiny factory with an explicitly captured engine.
out=out.replace('  private _compositeFBO!: AccumulationBuffer','  private _compositeFBO!: AccumulationBuffer\n'+bridge.replace('new LayerCompositor({','(() => { const engine = this; return new LayerCompositor({').replace('  })\n','  }) })()\n'));
fs.writeFileSync(path,out);
fs.writeFileSync('temp/494-layer-compositor/mapping.json',JSON.stringify({names,rename,map},null,2));
console.log({before:src.split('\n').length,after:out.split('\n').length});
