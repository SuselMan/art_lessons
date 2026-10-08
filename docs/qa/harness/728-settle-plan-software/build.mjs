import { build } from 'esbuild'
import fs from 'node:fs'
const out = process.argv[2] || 'temp/whole-plan-hosted'
fs.mkdirSync(out, { recursive: true })
await build({ entryPoints: ['docs/qa/harness/728-settle-plan-software/run.ts'], outfile: out + '/run.js', bundle: true, format: 'esm', platform: 'browser', loader: { '.txt': 'text' }, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'false' } })
fs.copyFileSync('docs/qa/harness/728-settle-plan-software/index.html', out + '/index.html')
console.log(out)
