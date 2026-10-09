import {execFileSync} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {assertPairCanFinish} from './pair-cleanup-guard.mjs'
const [resourceId,pairOut,durableOut]=process.argv.slice(2)
if(!resourceId||!pairOut||!durableOut||!/^[a-zA-Z0-9_-]+$/.test(resourceId))throw Error('Explicit resource ID, pair output and durable evidence required')
const parent=path.dirname(path.resolve(pairOut)),registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-qa/resources.json'),'utf8'))
if(registry[resourceId]?.path!==parent)throw Error('Pair output is not registered disposable resource')
assertPairCanFinish(pairOut,durableOut)
// Generic cleanup retains its own active-process/marker/nonce guards.
execFileSync('python3',[path.join(os.homedir(),'linux-setup/scripts/services/qa-cleanup.py'),'finish',resourceId],{stdio:'inherit'})
