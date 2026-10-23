import base from './vitest-load-storage.config.mjs';
export default {...base,test:{...base.test,include:[...base.test.include,'apps/web/src/engine/index.coverageFilm.test.ts']}};
