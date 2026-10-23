import base from './vitest.config.mjs'
export default {...base,test:{...base.test,include:['temp/closure/structural-negative.test.ts']}}
