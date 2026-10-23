import fs from 'node:fs'; import ts from 'typescript';
const path='apps/web/src/engine/index.ts',src=fs.readFileSync(path,'utf8'),f=ts.createSourceFile(path,src,ts.ScriptTarget.Latest,true),cls=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='PencilEngine');
const names=['_fieldOp','_waterFrontStep','_wcResample'];
const prefixes=['_fieldOp','_fieldOpHigh','_fieldOpCarry','_fieldOpCarryColour','_resample','_diffuse','_brushDrag','_waterFront'];
const owned=cls.members.filter(n=>ts.isPropertyDeclaration(n)&&prefixes.some(p=>['Prog','Uni','PosLoc'].some(s=>n.name?.text===p+s))).map(n=>n.name.text);
const edits=[],parts=[];const member=n=>cls.members.find(m=>m.name?.text===n);
const sub=s=>s.replaceAll('this._paperWorldSize','this.ctx.paperWorldSize').replaceAll('this._opts.paperScale','this.ctx.paperScale()').replaceAll('this._paperTex','this.ctx.paperTex()').replaceAll('this._screenBuf','this.ctx.screenBuf()').replaceAll('this._stamps','this.ctx.stamps()');
for(const n of cls.members){if(owned.includes(n.name?.text)){parts.push(src.slice(n.getFullStart(),n.end));edits.push([n.getFullStart(),n.end,'']);}if(names.includes(n.name?.text)){const name=n.name.text,signature=src.slice(n.getStart(f),n.body.getStart(f));parts.push(sub(src.slice(n.getFullStart(),n.end).replace('private '+name+'(',name.slice(1)+'(')).replace('field: SettleField','field: WatercolorPassField'));edits.push([n.getFullStart(),n.end,'\n  '+signature+'{\n    this._watercolorPasses.'+name.slice(1)+'('+n.parameters.map(p=>p.name.getText(f)).join(', ')+')\n  }']);}}
const diffuse=member('_diffuseWashOps');const declarations=new Map();function walk(n){if(ts.isVariableDeclaration(n)&&['diffuseStep','brushPass'].includes(n.name.getText(f)))declarations.set(n.name.getText(f),n);ts.forEachChild(n,walk);}walk(diffuse);
for(const [name,n] of declarations){const fn=n.initializer,body=sub(fn.body.getText(f));const signature=name==='diffuseStep'?`diffuseStep(field: WatercolorPassField, x0: number, y0: number, S: number, paperTexW: number, paperTexH: number, src: AccumulationBuffer, dst: AccumulationBuffer, radius: number, knight: boolean, gate: AccumulationBuffer)`:`brushPass(field: WatercolorPassField, flowTexture: WebGLTexture | null, radiusPx: number, S: number, source: AccumulationBuffer, out: AccumulationBuffer, pigment: AccumulationBuffer, base: AccumulationBuffer, mode: number)`;
parts.push('\n  '+signature+' '+body.replace('{','{\n    const { gl } = this'));
const args=name==='diffuseStep'?'field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate':'field, flowTexture, radiusPx, S, source, out, pigment, base, mode';edits.push([fn.body.getStart(f),fn.body.end,'{\n      this._watercolorPasses.'+name+'('+args+')\n    }']);}
// Single-paint absorption conversion has distinct uniform writes; preserve them verbatim.
let colourBody;function findColour(n){if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.getText(f).includes('const outColor = field.cc')&&n.body.getText(f).includes('gl.useProgram(this._fieldOpProg)'))colourBody=n.body;ts.forEachChild(n,findColour);}findColour(diffuse);if(!colourBody)throw Error('colour body missing');
const pigmentBody=sub(colourBody.getText(f)).replace('    const outColor = field.cc\n','').replaceAll('dep.out.texture','deposit.texture');parts.push('\n  pigmentColor(outColor: AccumulationBuffer, deposit: AccumulationBuffer, tau: readonly number[]): void '+pigmentBody.replace('{','{\n    const { gl } = this'));
edits.push([colourBody.getStart(f),colourBody.end,'{\n        this._watercolorPasses.pigmentColor(field.cc, dep.out, tau)\n      }']);
const init=member('_initGL');const groups={};let previous=-2,index=0;
for(let i=0;i<init.body.statements.length;i++){const st=init.body.statements[i];if(!ts.isExpressionStatement(st)||!ts.isBinaryExpression(st.expression)||!owned.includes(st.expression.left.name?.text))continue;if(i!==previous+1)index++;previous=i;const key='initStage'+index;(groups[key]??=[]).push(st.getText(f));edits.push([st.getStart(f),st.end,groups[key].length===1?'this._watercolorPasses.'+key+'()':'']);}
const stageNames=['initFieldPrograms','initSettlePrograms','initFieldUniforms','initFieldAttributes','initDiffusionAttributes'];if(Object.keys(groups).length!==stageNames.length)throw Error('unexpected init groups '+Object.keys(groups).length);
for(const [i,key]of Object.keys(groups).entries()){const name=stageNames[i];parts.push('\n  '+name+'(): void {\n    const { gl } = this\n    '+groups[key].join('\n    ')+'\n  }');for(const edit of edits)edit[2]=edit[2].replace('this._watercolorPasses.'+key+'()','this._watercolorPasses.'+name+'()');}
const context=`export interface WatercolorPassField { w: number; h: number; coverage: AccumulationBuffer }
export interface WatercolorPassesContext {
  gl(): WebGLRenderingContext
  screenBuf(): WebGLBuffer
  paperTex(): WebGLTexture
  paperScale(): number
  paperWorldSize(): { w: number; h: number }
  stamps(): StampPainter
}
`;
const programs=owned.filter(n=>n.endsWith('Prog'));
const content=context+`\n/** Watercolor field GPU primitives. Scheduling and working textures stay with\n * the engine. Separate init stages preserve the existing GL call order. */\nexport class WatercolorPasses {
  private readonly ctx: WatercolorPassesContext
  constructor(ctx: WatercolorPassesContext) { this.ctx = ctx }
  private get gl(): WebGLRenderingContext { return this.ctx.gl() }
`+parts.join('\n')+'\n\n  destroy(): void {\n'+programs.map(p=>'    this.gl.deleteProgram(this.'+p+')').join('\n')+'\n  }\n}\n';
const ids=new Set(),cf=ts.createSourceFile('x.ts',content,ts.ScriptTarget.Latest,true);function idwalk(n){if(ts.isIdentifier(n))ids.add(n.text);ts.forEachChild(n,idwalk);}idwalk(cf);const imports=[];
for(const n of f.statements){if(!ts.isImportDeclaration(n)||!n.importClause?.namedBindings||!ts.isNamedImports(n.importClause.namedBindings))continue;const used=n.importClause.namedBindings.elements.filter(e=>ids.has(e.name.text));if(used.length)imports.push('import '+(n.importClause.isTypeOnly?'type ':'')+'{ '+used.map(e=>e.getText(f)).join(', ')+' } from '+JSON.stringify(n.moduleSpecifier.text.replace('./src/','../')));}
fs.writeFileSync('apps/web/src/engine/src/raster/WatercolorPasses.ts',imports.join('\n')+'\n\n'+content);
let out=src;for(const[a,b,s]of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+s+out.slice(b);
out="import { WatercolorPasses } from './src/raster/WatercolorPasses'\n"+out;
out=out.replace('  private readonly _ribbonPasses =','  private readonly _watercolorPasses = new WatercolorPasses({\n    gl: () => this.gl,\n    screenBuf: () => this._screenBuf,\n    paperTex: () => this._paperTex,\n    paperScale: () => this._opts.paperScale,\n    paperWorldSize: () => this._paperWorldSize(),\n    stamps: () => this._stamps,\n  })\n\n  private readonly _ribbonPasses =');
out=out.replace('    this._ribbonPasses.destroy()','    this._ribbonPasses.destroy()\n    this._watercolorPasses.destroy()');fs.writeFileSync(path,out);fs.writeFileSync('temp/494-wash-passes/extraction.json',JSON.stringify({owned,groups,stageNames},null,2));
