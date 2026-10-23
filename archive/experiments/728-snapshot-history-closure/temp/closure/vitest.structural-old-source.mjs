import base from './vitest.config.mjs'
export default {...base,plugins:[...base.plugins,{name:'previous-structural-mode-negative',enforce:'pre',transform(code,id){
 if(!id.endsWith('/apps/web/src/engine/index.ts'))return;
 const start=code.indexOf('    if (replayStructure) {'),end=code.indexOf('    await this.preloadImages(ops)',start);
 if(start<0||end<0)throw Error('Structural seam absent');
 return code.slice(0,start)+code.slice(end).replace('return this._replayRestoredStructure ? this.getOperations() : this._snapshotIO.operationsSinceRestore()','return this._snapshotIO.operationsSinceRestore()');
}}]}
