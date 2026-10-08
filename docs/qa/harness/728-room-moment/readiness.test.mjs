import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('fixture selects real store drawing tool before waiting on input lock',()=>{const source=fs.readFileSync(new URL('./controller.mjs',import.meta.url),'utf8');const select=source.indexOf("window.__roomStore.getState().setTool('watercolor')");const gate=source.indexOf('await wait(()=>!window.__engine._locked');assert.ok(select>=0&&gate>select);assert.equal(source.includes('setLocked(false)'),false);assert.equal(source.includes('setDeviceMetricsOverride'),false)})
