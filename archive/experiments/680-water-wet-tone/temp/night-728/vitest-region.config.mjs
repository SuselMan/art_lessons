import base from './vitest-combined-closure.config.mjs';
export default {...base,test:{...base.test,include:['apps/web/src/engine/src/buffers/AccumulationBuffer.snapshotRegion.test.ts','apps/web/src/engine/index.networkSnapshot.test.ts','apps/web/src/engine/src/oplog/snapshotTiles.test.ts']}};
