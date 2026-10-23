export default {
 resolve: { alias: [
 { find: 'nanoid', replacement: '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/nanoid/index.js' },
 { find: 'lodash-es', replacement: '/home/suselman/projects/pencil-agents/680-device-qa-guards/node_modules/lodash-es/lodash.js' },
 { find: '@grafetto/shared', replacement: '/home/suselman/projects/pencil-agents/728-zero-cost-flux/packages/shared/src/index.ts' }
 ] },
 test: { environment:'node', include:['apps/**/*.test.ts'] }
}
