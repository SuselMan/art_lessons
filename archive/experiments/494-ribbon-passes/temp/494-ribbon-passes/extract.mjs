import fs from 'node:fs';import ts from 'typescript';
const file='apps/web/src/engine/index.ts',src=fs.readFileSync(file,'utf8'),f=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true),engine=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='PencilEngine');
const names=['_drawRibbonNibPass','_drawRibbonBands','_drawRibbonCompositeRect','_drawRibbonCompositeDab'];const owned=['_ribbonProg','_ribbonUni','_ribbonPosLoc','_ribbonEdgeLoc','_ribbonInkLoc','_ribbonInkWaterLoc','_ribbonAcrossLoc','_ribbonInkWetLoc','_ribbonInkStrengthLoc','_ribbonPuddleLoc','_ribbonBuf'];const edits=[];
const props=['_stamps','_paperTex','_quadBuf','_minmaxExt','_paperFillThreshold','_paperFillCap','_wcDebugView','_wcAb'];
function replace(s){for(const name of names)s=s.replaceAll('this.'+name,'this.'+name.slice(1));s=s.replaceAll('this._dabProg','this.ctx.stamps().program').replaceAll('this._dabUni','this.ctx.stamps().uniforms').replaceAll('this._dabPosLoc','this.ctx.stamps().positionLoc').replaceAll('this._opts.paperScale','this.ctx.paperScale()').replaceAll('this._paperWorldSize','this.ctx.paperWorldSize');for(const n of props)s=s.replaceAll('this.'+n,'this.ctx.'+n.slice(1)+'()');return s;}
const moved=[];for(const n of engine.members){const name=n.name?.getText(f);if(owned.includes(name)){moved.push(src.slice(n.getFullStart(),n.end));edits.push([n.getFullStart(),n.end,'']);}if(names.includes(name)){moved.push(replace(src.slice(n.getFullStart(),n.end).replace('private '+name+'(',name.slice(1)+'(')));const signature=src.slice(n.getStart(f),n.body.getStart(f));const args=n.parameters.map(p=>p.name.getText(f)).join(', ');edits.push([n.getFullStart(),n.end,'\n  '+signature+'{\n    this._ribbonPasses.'+name.slice(1)+'('+args+')\n  }']);}}
const init=engine.members.find(n=>n.name?.text==='_initGL'),groups={initProgram:[],initUniforms:[],initAttributes:[],initBuffer:[]};const assignments=[];
for(const statement of init.body.statements){if(!ts.isExpressionStatement(statement)||!ts.isBinaryExpression(statement.expression))continue;const left=statement.expression.left;if(!ts.isPropertyAccessExpression(left)||!owned.includes(left.name.text))continue;const name=left.name.text;const stage=name==='_ribbonProg'?'initProgram':name==='_ribbonUni'?'initUniforms':name==='_ribbonBuf'?'initBuffer':'initAttributes';groups[stage].push(statement.getText(f));assignments.push({statement,stage});}
const first=new Set();for(const {statement,stage} of assignments){const replacement=first.has(stage)?'':'this._ribbonPasses.'+stage+'()';first.add(stage);edits.push([statement.getStart(f),statement.end,replacement]);}
const stages=Object.entries(groups).map(([name,lines])=>'  '+name+'(): void {\n    const { gl } = this\n    '+lines.join('\n    ')+'\n  }').join('\n\n');
const context=`export interface RibbonPassesContext {
  gl(): WebGLRenderingContext
  stamps(): StampPainter
  paperTex(): WebGLTexture
  quadBuf(): WebGLBuffer
  minmaxExt(): { MAX_EXT: number } | null
  paperScale(): number
  paperWorldSize(): { w: number; h: number }
  paperFillThreshold(): number
  paperFillCap(): number
  wcDebugView(): number
  wcAb(): { noSpread: boolean; noMigrate: boolean }
}
`;
const content=context+'\n/** Ribbon GPU draw primitives and their band program/vertex buffer.\n * The four init stages preserve the engine\'s existing GL allocation order. */\nexport class RibbonPasses {\n  private readonly ctx: RibbonPassesContext\n  constructor(ctx: RibbonPassesContext) { this.ctx = ctx }\n  private get gl(): WebGLRenderingContext { return this.ctx.gl() }\n'+moved.join('\n')+'\n\n'+stages+'\n\n  destroy(): void {\n    this.gl.deleteProgram(this._ribbonProg)\n    this.gl.deleteBuffer(this._ribbonBuf)\n  }\n}\n';
const ids=new Set();const tf=ts.createSourceFile('x.ts',content,ts.ScriptTarget.Latest,true);const walk=n=>{if(ts.isIdentifier(n))ids.add(n.text);ts.forEachChild(n,walk)};walk(tf);const imports=[];for(const n of f.statements){if(!ts.isImportDeclaration(n)||!n.importClause?.namedBindings||!ts.isNamedImports(n.importClause.namedBindings))continue;const used=n.importClause.namedBindings.elements.filter(e=>ids.has(e.name.text));if(!used.length)continue;imports.push('import '+(n.importClause.isTypeOnly?'type ':'')+'{ '+used.map(e=>e.getText(f)).join(', ')+' } from '+JSON.stringify(n.moduleSpecifier.text.replace('./src/','../')));}
fs.writeFileSync('apps/web/src/engine/src/raster/RibbonPasses.ts',imports.join('\n')+'\n\n'+content);
let out=src;for(const[a,b,text]of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+text+out.slice(b);
const field='\n  private readonly _ribbonPasses = new RibbonPasses({\n    gl: () => this.gl,\n'+props.map(n=>'    '+n.slice(1)+': () => this.'+n+',').join('\n')+'\n    paperScale: () => this._opts.paperScale,\n    paperWorldSize: () => this._paperWorldSize(),\n  })\n';out=out.replace('  private readonly _ribbonPainter =',field+'\n  private readonly _ribbonPainter =');out=out.replace('    this._brush.destroy()','    this._brush.destroy()\n    this._ribbonPasses.destroy()');out="import { RibbonPasses } from './src/raster/RibbonPasses'\n"+out;fs.writeFileSync(file,out);
fs.writeFileSync('temp/494-ribbon-passes/init-stages.json',JSON.stringify(Object.fromEntries(Object.entries(groups).map(([name,x])=>[name,x.length])),null,2));
