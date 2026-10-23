import base from './vitest-combined-closure.config.mjs';
export default {...base,test:{...base.test,include:['apps/web/src/engine/index.networkSnapshot.test.ts','apps/web/src/engine/src/oplog/checkpointStore.test.ts','apps/web/src/engine/src/oplog/snapshotLedger.test.ts']}};
