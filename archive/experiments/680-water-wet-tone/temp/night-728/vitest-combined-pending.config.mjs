import base from './vitest-combined-ring.config.mjs';
export default {...base,test:{...base.test,include:[...base.test.include,'apps/web/src/engine/src/oplog/OperationLog.test.ts']}};
