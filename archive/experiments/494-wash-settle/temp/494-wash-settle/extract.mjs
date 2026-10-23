import fs from 'node:fs';import ts from 'typescript';
const file='apps/web/src/engine/index.ts',src=fs.readFileSync(file,'utf8'),f=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true),engine=f.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='PencilEngine'),member=name=>engine.members.find(n=>n.name?.text===name),edits=[];
const top=name=>f.statements.find(n=>n.name?.text===name||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name?.text===name)));
const type=top('SettleField'),destroy=top('destroyField');
fs.writeFileSync('apps/web/src/engine/src/buffers/SettleField.ts',"import type { AccumulationBuffer } from './AccumulationBuffer'\n"+src.slice(type.getFullStart(),type.end).replace('type SettleField','export type SettleField')+'\n'+src.slice(destroy.getFullStart(),destroy.end).replace('function destroyField','export function destroyField')+'\n');for(const n of[type,destroy])edits.push([n.getFullStart(),n.end,'']);
const constants=['WC_HALF_RES_RADIUS_PX','WC_HALF_RES_SPAN_PX'];fs.writeFileSync('apps/web/src/engine/src/watercolor/settleResolution.ts',constants.map(name=>{const n=top(name);edits.push([n.getFullStart(),n.end,'']);return src.slice(n.getFullStart(),n.end).replace('const '+name,'export const '+name)}).join('\n')+'\n');
const planNames=['_diffuseWashOps','_groupTideOps'],textureNames=['_brushFlowTex','_foreignWaterTex'];
const planSub=s=>s.replaceAll('this._diffuseFieldFor','this.ctx.fieldFor').replaceAll('this._paperWorldSize','this.ctx.paperWorldSize').replaceAll('this._ribbonScratchPool','this.ctx.pool()').replaceAll('this._minmaxExt','this.ctx.minmaxExt()').replaceAll('this._wcAb','this.ctx.ab()').replaceAll('this._groupTideOps','this.groupTideOps').replaceAll('this._fieldOp','this.ctx.passes().fieldOp').replaceAll('this._waterFrontStep','this.ctx.passes().waterFrontStep').replaceAll('this._wcResample','this.ctx.passes().wcResample').replaceAll('this._watercolorPasses','this.ctx.passes()');
const planParts=[];for(const name of textureNames){const n=member(name);planParts.push(src.slice(n.getFullStart(),n.end));edits.push([n.getFullStart(),n.end,'']);}
for(const name of planNames){const n=member(name),newName=name==='_diffuseWashOps'?'prepare':'groupTideOps';planParts.push(planSub(src.slice(n.getFullStart(),n.end).replace('private '+name+'(',newName+'(')));const signature=src.slice(n.getStart(f),n.body.getStart(f));edits.push([n.getFullStart(),n.end,'\n  '+signature+'{\n    '+(name==='_diffuseWashOps'?'return ':'')+'this._settlePlan.'+newName+'('+n.parameters.map(p=>p.name.getText(f)).join(', ')+')\n  }']);}
const planContext=`export interface WatercolorSettlePlanContext {
  gl(): WebGLRenderingContext
  fieldFor(w: number, h: number): SettleField
  paperWorldSize(): { w: number; h: number }
  pool(): RibbonScratchPool
  minmaxExt(): { MAX_EXT: number } | null
  ab(): { noDiffuse: boolean; noCarry: boolean; opDry: boolean }
  passes(): WatercolorPasses
}
`;
const planContent=planContext+`\n/** Builds the ordered GPU steps and the final tile copy-back of one settle.\n * Working fields and frame scheduling remain separate owners. */\nexport class WatercolorSettlePlan {
  private readonly ctx: WatercolorSettlePlanContext
  constructor(ctx: WatercolorSettlePlanContext) { this.ctx = ctx }
  private get gl(): WebGLRenderingContext { return this.ctx.gl() }
`+planParts.join('\n')+`\n
  destroyTextures(): void {
    this.gl.deleteTexture(this._brushFlowTex)
    this.gl.deleteTexture(this._foreignWaterTex)
  }

  forgetTextures(): void {
    this._brushFlowTex = null
    this._foreignWaterTex = null
  }
}
`;
function importsFor(content){const names=new Set(),tf=ts.createSourceFile('x.ts',content,ts.ScriptTarget.Latest,true);function walk(n){if(ts.isIdentifier(n))names.add(n.text);ts.forEachChild(n,walk)}walk(tf);const imports=[];for(const n of f.statements){if(!ts.isImportDeclaration(n)||!n.importClause?.namedBindings||!ts.isNamedImports(n.importClause.namedBindings))continue;const kept=n.importClause.namedBindings.elements.filter(e=>names.has(e.name.text));if(kept.length)imports.push('import '+(n.importClause.isTypeOnly?'type ':'')+'{ '+kept.map(e=>e.getText(f)).join(', ')+' } from '+JSON.stringify(n.moduleSpecifier.text.replace('./src/','../')))}return imports.join('\n');}
fs.writeFileSync('apps/web/src/engine/src/raster/WatercolorSettlePlan.ts',importsFor(planContent)+"\nimport type { SettleField } from '../buffers/SettleField'\nimport { WC_HALF_RES_RADIUS_PX, WC_HALF_RES_SPAN_PX } from '../watercolor/settleResolution'\n\n"+planContent);
const queueNames=['_startSettle','_scheduleSettleTick','_tickSettle','_advanceSettle','_completeSettle','_cancelSettle'],queueMethodNames=['start','scheduleTick','tick','advance','complete','cancel'],queueFields=['_settle','_settleTickAt','_settleSkipped','WET_SETTLE_OPS_PER_TICK'],queueParts=[];
const queueSub=s=>{for(const[i,name]of queueNames.entries())s=s.replaceAll('this.'+name,'this.'+queueMethodNames[i]);return s.replaceAll('PencilEngine.WET_SETTLE_OPS_PER_TICK','WatercolorSettleQueue.WET_SETTLE_OPS_PER_TICK').replaceAll('this._wcPerf','this.ctx.perf()').replaceAll('this._scheduleFieldRelease','this.ctx.scheduleFieldRelease').replaceAll('this._strokeLayerId','this.ctx.isDrawing()').replaceAll('this._opQueue.length','this.ctx.backlogSize()').replaceAll('this.settleBacklogMax','this.ctx.backlogMax()').replace('this._washActiveAt = performance.now()','this.ctx.noteActivity(performance.now())').replace("if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }",'this.ctx.beforeStart()');};
for(const name of queueFields){const n=member(name);queueParts.push(src.slice(n.getFullStart(),n.end));edits.push([n.getFullStart(),n.end,name==='_settle'?"\n  private get _settle() { return this._settleQueue.current }":'']);}
for(const[i,name]of queueNames.entries()){const n=member(name);queueParts.push(queueSub(src.slice(n.getFullStart(),n.end).replace('private '+name+'(',queueMethodNames[i]+'(')));const signature=src.slice(n.getStart(f),n.body.getStart(f));edits.push([n.getFullStart(),n.end,'\n  '+signature+'{\n    this._settleQueue.'+queueMethodNames[i]+'('+n.parameters.map(p=>p.name.getText(f)).join(', ')+')\n  }']);}
const queueContext=`export interface WatercolorSettleQueueContext {
  beforeStart(): void
  perf(): { settleStart: number; settleOps: number; settleMs: number }
  isDrawing(): boolean
  backlogSize(): number
  backlogMax(): number
  noteActivity(now: number): void
  scheduleFieldRelease(): void
}
`;
fs.writeFileSync('apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts',"import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'\n\n"+queueContext+`\n/** One settle at a time: synchronous drain or adaptive animation-frame steps.\n * The first entry captures the deposit immediately; the rest may yield. */\nexport class WatercolorSettleQueue {
  private readonly ctx: WatercolorSettleQueueContext
  constructor(ctx: WatercolorSettleQueueContext) { this.ctx = ctx }
  get current() { return this._settle }
`+queueParts.join('\n')+'\n}\n');
let out=src;for(const[a,b,s]of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+s+out.slice(b);
const instances=`  private readonly _settlePlan = new WatercolorSettlePlan({
    gl: () => this.gl,
    fieldFor: (w, h) => this._diffuseFieldFor(w, h),
    paperWorldSize: () => this._paperWorldSize(),
    pool: () => this._ribbonScratchPool,
    minmaxExt: () => this._minmaxExt,
    ab: () => this._wcAb,
    passes: () => this._watercolorPasses,
  })
  private readonly _settleQueue = new WatercolorSettleQueue({
    beforeStart: () => {
      if (this._fieldReleaseTimer) { clearTimeout(this._fieldReleaseTimer); this._fieldReleaseTimer = 0 }
    },
    perf: () => this._wcPerf,
    isDrawing: () => !!this._strokeLayerId,
    backlogSize: () => this._opQueue.length,
    backlogMax: () => this.settleBacklogMax,
    noteActivity: now => { this._washActiveAt = now },
    scheduleFieldRelease: () => this._scheduleFieldRelease(),
  })

`;
out=out.replace('  private readonly _watercolorPasses =',instances+'  private readonly _watercolorPasses =');out=out.replace('    this.gl.deleteTexture(this._brushFlowTex)\n    this.gl.deleteTexture(this._foreignWaterTex)','    this._settlePlan.destroyTextures()').replace('    this._brushFlowTex = null\n    this._foreignWaterTex = null','    this._settlePlan.forgetTextures()');
out="import { WatercolorSettlePlan } from './src/raster/WatercolorSettlePlan'\nimport { WatercolorSettleQueue } from './src/watercolor/WatercolorSettleQueue'\nimport { destroyField, type SettleField } from './src/buffers/SettleField'\nimport { WC_HALF_RES_RADIUS_PX } from './src/watercolor/settleResolution'\n"+out;fs.writeFileSync(file,out);fs.writeFileSync('temp/494-wash-settle/extraction.json',JSON.stringify({planNames,textureNames,queueNames,queueMethodNames,queueFields,constants},null,2));
