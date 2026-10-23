import fs from 'node:fs';
import ts from 'typescript';
const file='apps/web/src/engine/index.ts'; const src=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true); const engine=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='PencilEngine');
const names=['_retireWashesOf','_replayChunkScratch','_trimChunkCache','_evictChunk','_cancelSpillJob','_startSpill','_pumpSpills','_pumpSpillsLater','_trimSpilled','_forgetWashesOf'];
const fields=['_chunkAuthors','_spilledWashes','_lostWashes','_spillJob','_spillPumpTimer','_replayRibbonChunks'];
const edits=[]; const moved=[];
const rename={'_replayRibbonChunks':'chunks','_chunkAuthors':'authors','_spilledWashes':'spilled','_lostWashes':'lost','_spillJob':'spillJob','_spillPumpTimer':'spillPumpTimer'};
for(const name of names) rename[name]=name.slice(1);
for(const name of ['_ribbonScratchPool','_destroyed','_contextLost','_inJobStep','_gpuBudget']) rename[name]='ctx.'+name.slice(1);
for(const name of ['_completeSettle','_rebuildLostWash','_scheduleBudgetCheck','_washGpuBytes']) rename[name]='ctx.'+name.slice(1);
function replace(s){for(const [a,b] of Object.entries(rename)) s=s.replaceAll('this.'+a,'this.'+b); return s.replaceAll('this._settle?.scratch','this.ctx.settlingScratch');}
for(const member of engine.members){const name=member.name?.getText(ast); if(!names.includes(name)&&!fields.includes(name)) continue;
 const start=member.getFullStart(); let text=src.slice(start,member.end); edits.push([start,member.end,'']);
 if(names.includes(name)){ text=text.replace('private '+name+'(',' '+rename[name]+'(').replace('private '+name+'\n',' '+rename[name]+'\n');
 if(name==='_trimChunkCache') {const a=text.indexOf('        const finished =');const b=text.indexOf('\n        if (finished)',a); const selection=text.slice(a,b); fs.writeFileSync('temp/494-wash-cache/finished-selection.txt',selection); text=text.slice(0,a)+'        const finished = this.ctx.finishedChunk()'+text.slice(b);}
 } else text=text.replace('private '+name,rename[name]);
 moved.push(replace(text));
}
const constants=ast.statements.filter(n=>n.getText(ast).startsWith('const REPLAY_RIBBON_CHUNK_SLOTS')||n.getText(ast).startsWith('const SPILLED_WASHES_MAX_BYTES'));
for(const n of constants) edits.push([n.getFullStart(),n.end,'']);
const header=`import type { Dab, StrokeOperation } from '@grafetto/shared'
import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer } from './ILayerBuffer'
import type { RibbonProfile } from '../dabs/ribbonProfile'
import type { RibbonScratchPool } from './RibbonScratchPool'
import { RibbonStrokeScratch, type SpilledScratch } from './RibbonStrokeScratch'

export interface ReplayRibbonChunk {
  strokeId: string
  washStrokeId?: string
  target: ILayerBuffer
  scratch: RibbonStrokeScratch
  lastDab: Dab
  usedAt?: number
}

export interface RibbonReplayCacheContext {
  readonly ribbonScratchPool: RibbonScratchPool
  readonly destroyed: boolean
  readonly contextLost: boolean
  readonly inJobStep: boolean
  readonly gpuBudget: number
  readonly settlingScratch: RibbonStrokeScratch | undefined
  completeSettle(): void
  finishedChunk(): [string, ReplayRibbonChunk] | undefined
  rebuildLostWash(target: ILayerBuffer): void
  scheduleBudgetCheck(): void
  washGpuBytes(): number
}
`;
fs.writeFileSync('apps/web/src/engine/src/buffers/RibbonReplayCache.ts',header+constants.map(n=>src.slice(n.getFullStart(),n.end)).join('\n')+'\n\n/** Owns replay gesture/wash scratch, LRU ordering and compact GPU parking.\n * Rendering, rebuild jobs, settle and device budget policy stay in the engine. */\nexport class RibbonReplayCache {\n  private readonly ctx: RibbonReplayCacheContext\n  constructor(ctx: RibbonReplayCacheContext) { this.ctx = ctx }\n'+moved.join('\n')+'\n}\n');
let out=src; for(const [a,b,s] of edits.sort((a,b)=>b[0]-a[0])) out=out.slice(0,a)+s+out.slice(b);
// Keep existing engine call sites and job-local cache swapping as narrow delegates.
const delegates=`
  private readonly _ribbonCache: RibbonReplayCache
  private get _replayRibbonChunks() { return this._ribbonCache.chunks }
  private set _replayRibbonChunks(chunks: Map<string, ReplayRibbonChunk>) { this._ribbonCache.chunks = chunks }
  private get _chunkAuthors() { return this._ribbonCache.authors }
  private get _spilledWashes() { return this._ribbonCache.spilled }
  private get _lostWashes() { return this._ribbonCache.lost }
  private get _spillJob() { return this._ribbonCache.spillJob }
  private _retireWashesOf(op: StrokeOperation): void { this._ribbonCache.retireWashesOf(op) }
  private _replayChunkScratch(target: ILayerBuffer, strokeId: string | undefined, washId: string | undefined, dabs: Dab[], profile: RibbonProfile) {
    return this._ribbonCache.replayChunkScratch(target, strokeId, washId, dabs, profile)
  }
  private _trimChunkCache(): void { this._ribbonCache.trimChunkCache() }
  private _evictChunk(key: string, keep: boolean): void { this._ribbonCache.evictChunk(key, keep) }
  private _cancelSpillJob(): void { this._ribbonCache.cancelSpillJob() }
  private _startSpill(key: string): void { this._ribbonCache.startSpill(key) }
  private _forgetWashesOf(target: ILayerBuffer): void { this._ribbonCache.forgetWashesOf(target) }
`;
out=out.replace('  private _inJobStep = false','  private _inJobStep = false\n'+delegates);
const init=`
    const engine = this
    this._ribbonCache = new RibbonReplayCache({
      get ribbonScratchPool() { return engine._ribbonScratchPool },
      get destroyed() { return engine._destroyed },
      get contextLost() { return engine._contextLost },
      get inJobStep() { return engine._inJobStep },
      get gpuBudget() { return engine._gpuBudget },
      get settlingScratch() { return engine._settle?.scratch },
      completeSettle: () => this._completeSettle(),
      finishedChunk: () => [...this._replayRibbonChunks].find(([, chunk]) => {
        const job = [...this._rebuildJobs.values()].find(j => j.fresh === chunk.target)
        if (!job) return false
        const remaining = this._log.layerPixelOps(job.layerId).slice(job.start + job.applied.length)
        return !remaining.some(op => op.type === 'stroke' && (op.washId ?? op.strokeId) === chunk.strokeId)
      }),
      rebuildLostWash: target => this._rebuildLostWash(target),
      scheduleBudgetCheck: () => this._scheduleBudgetCheck(),
      washGpuBytes: () => this._washGpuBytes(),
    })`;
// Preserve the grouping key comparison literally, rather than assuming strokeId equals map key.
out=out.replace('    this._ribbonScratchPool = new RibbonScratchPool(gl)','    this._ribbonScratchPool = new RibbonScratchPool(gl)'+init.replace('find(([, chunk])','find(([key, chunk])').replace('=== chunk.strokeId','=== key'));
out=out.replace("import { RibbonScratchPool }", "import { RibbonReplayCache, type ReplayRibbonChunk } from './src/buffers/RibbonReplayCache'\nimport { RibbonScratchPool }");
out=out.replace(', type SpilledScratch','');
fs.writeFileSync(file,out);
