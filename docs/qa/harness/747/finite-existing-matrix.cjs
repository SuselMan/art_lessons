// Offline planning by default. Never creates/deletes rooms or layers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const formats=[['a4p',1240,1754],['a4l',1754,1240],['a3p',1754,2480],['a3l',2480,1754],['a2p',2480,3508],['a2l',3508,2480]];
const env=process.env,root=env.QA_FIXTURE_LEDGER||path.join(require('node:os').homedir(),'.cache/codex-qa/puddle-747-native-gate-20261017');
const layers=env.QA_EXISTING_LAYER_MAP?JSON.parse(fs.readFileSync(env.QA_EXISTING_LAYER_MAP)):{};
const selected=env.QA_FORMAT?formats.filter(([name])=>name===env.QA_FORMAT):formats;assert.ok(selected.length,'Unknown QA_FORMAT');
const plan=selected.map(([name,width,height])=>{const fixture=path.join(root,'fixture-'+name),f=JSON.parse(fs.readFileSync(path.join(fixture,'fixture.json')));assert.equal(f.disposable,true);assert.equal(f.owner,'puddle_undo747');assert.equal(f.width,width);assert.equal(f.height,height);assert.ok(fs.existsSync(path.join(fixture,'host-state.json')),'Private auth missing');return{name,width,height,fixture,layer:layers[name]}});
console.log(JSON.stringify({mode:env.QA_RUN==='1'?'run':'offline-plan',formats:plan.map(({name,width,height,layer})=>({name,width,height,existingLayerConfigured:typeof layer==='string'&&!!layer}))}));
if(env.QA_RUN==='1'){
 assert.ok(env.QA_SOURCE&&env.QA_CDP&&env.QA_BASE_URL&&env.QA_OUTPUT,'Explicit source/device/origin/output required');
 assert.equal(env.QA_GPU_GATE,'allocated-and-frozen','Operator must confirm exclusive GPU allocation and source freeze');
 assert.ok(plan.every(x=>typeof x.layer==='string'&&x.layer),'Supply exact existing layer IDs for every selected format');
 for(const item of plan){const output=path.join(env.QA_OUTPUT,item.name);assert.ok(!fs.existsSync(output),'Do not overwrite prior run');const r=spawnSync(process.execPath,[path.join(__dirname,'finite-existing-android.cjs')],{stdio:'inherit',env:{...env,QA_FIXTURE:item.fixture,QA_EXISTING_LAYER:item.layer,QA_OUTPUT:output}});if(r.status!==0)process.exit(r.status||1)}
}
