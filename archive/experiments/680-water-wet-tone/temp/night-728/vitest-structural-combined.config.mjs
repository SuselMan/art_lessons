import base from './vitest-combined-closure.config.mjs';
export default {...base,test:{...base.test,include:['apps/server/src/rooms/snapshotReplayPlan.test.ts','apps/server/src/rooms/snapshotReplayLoader.test.ts','apps/web/src/pages/Room/net/snapshotRestore.test.ts','apps/web/src/engine/index.structuralSnapshot.test.ts','apps/web/src/pages/Room/net/structuralSnapshotBase.test.ts']}};
