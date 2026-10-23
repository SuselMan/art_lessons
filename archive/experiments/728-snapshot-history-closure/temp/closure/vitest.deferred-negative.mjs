import base from './vitest.config.mjs'
export default {...base,plugins:[...base.plugins,{name:'legacy-prefix-deferred-negative',enforce:'pre',transform(code,id){if(!id.endsWith('/apps/web/src/engine/index.ts'))return;const start=code.indexOf('  async restoreHistoricalOperations('),end=code.indexOf('\n  getOperationsSinceRestore()',start);if(start<0||end<0)throw Error('Negative seam absent');const original=code.slice(start,end);if(!original.includes('this._rebuildLayer(id)'))throw Error('Negative seam changed');return code.slice(0,start)+`  async restoreHistoricalOperations(ops: Operation[]): Promise<void> {
 const affected=new Set<string>();for(const op of ops)for(const id of pixelWriteLayerIds(op))if(this._layers.has(id)&&!this._snapshots.isCovered(id,op.seq))affected.add(id);
 this.absorbHistoricalOperations(ops);await this.preloadImages(ops);for(const id of affected)this._rebuildLayerOrDefer(id);
 }
`+code.slice(end)}}]}
