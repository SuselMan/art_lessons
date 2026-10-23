import {createRequire} from 'node:module';
const dependencyRoot='/home/suselman/projects/pencil-agents/680-device-qa-guards';
const require=createRequire(dependencyRoot+'/package.json');
export default {root:'/home/suselman/projects/pencil-agents/728-snapshot-history-closure',resolve:{alias:{'@grafetto/shared':'/home/suselman/projects/pencil-agents/728-snapshot-history-closure/packages/shared/src/index.ts'}},plugins:[{name:'existing-real-dependencies',enforce:'pre',resolveId(id){if(id.startsWith('.')||id.startsWith('/')||id==='vitest'||id.startsWith('vitest/')||id==='@grafetto/shared'||id.startsWith('node:'))return;try{return require.resolve(id)}catch{}}}],test:{include:['apps/**/*.test.ts'],environment:'node'}};
