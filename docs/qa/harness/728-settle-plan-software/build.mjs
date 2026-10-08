import { build } from 'esbuild'
import fs from 'node:fs'
const out = process.argv[2] || 'temp/whole-plan-hosted'
fs.mkdirSync(out, { recursive: true })
await build({ entryPoints: ['docs/qa/harness/728-settle-plan-software/run.ts'], outfile: out + '/run.js', bundle: true, format: 'esm', platform: 'browser', loader: { '.txt': 'text' }, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'false' }, plugins: [{
 name: 'standalone-paper-namespace',
 setup(context) {
  context.onLoad({ filter: /[/\\]paperLoader\.ts$/ }, async args => {
   const source = fs.readFileSync(args.path, 'utf8')
   if (!source.includes("const PAPER_DIR = '/paper'")) throw new Error('Paper loader namespace seam changed')
   // Relocate only the asset URL for nested QA hosting. Decode, catch rebuild,
   // manifest and actual baked bytes remain the original implementation.
   return { contents: source.replace("const PAPER_DIR = '/paper'", "const PAPER_DIR = './paper'"), loader: 'ts' }
  })
 },
}] })
fs.copyFileSync('docs/qa/harness/728-settle-plan-software/index.html', out + '/index.html')
console.log(out)
