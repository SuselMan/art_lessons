import base from './vitest-combined-source.config.mjs';
export default {...base,test:{...base.test,include:[...base.test.include,'apps/web/src/engine/src/raster/shaders.test.ts']}};
