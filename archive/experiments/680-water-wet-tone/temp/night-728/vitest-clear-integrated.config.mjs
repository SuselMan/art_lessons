import base from './vitest-combined-closure.config.mjs';
export default {...base,test:{...base.test,include:['apps/web/src/pages/Room/clearedInBatch.test.ts','apps/web/src/pages/Room/restoreRoomState.test.ts','apps/web/src/pages/Room/useRoomRestore.test.ts','apps/web/src/pages/Room/undoneInBatch.test.ts']}};
