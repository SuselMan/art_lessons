'use strict';
// Frozen native comparison builds, using existing dependencies and baked paper.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),out=process.env.QA_OUTPUT,set=process.env.QA_SET,paperDir=process.env.QA_PAPER_DIR;
if(!out||!paperDir||!set||!/^[a-z0-9-]+$/.test(set))throw Error('QA_OUTPUT, QA_SET and QA_PAPER_DIR required');
const paper=JSON.parse(fs.readFileSync(path.join(paperDir,'manifest.json')));
for(const[name,extra]of [['original',{}],['lazy',{QA_FRONT_LAZY:'1'}],['one-octave',{QA_FRONT_ONE_OCTAVE:'1'}]]){
 const target=path.join(out,set+'-'+name);if(fs.existsSync(target))throw Error('Frozen destination exists: '+target);
 cp.execFileSync(process.execPath,[path.join(root,'docs/qa/prototypes/mini-worker/build.cjs')],{stdio:'inherit',env:{...process.env,QA_OUTPUT:target,QA_NATIVE_CAPTURE:'1',QA_FRONT_ZERO:'1',QA_FRONT_JUMP_ZERO:'1',QA_FRONT_LAZY:'0',QA_FRONT_ONE_OCTAVE:'0',...extra}});
 const manifestPath=path.join(target,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));fs.mkdirSync(path.join(target,'paper'));
 for(const file of ['manifest.json',paper.assets.fine.texture,paper.assets.fine.preview]){
  const dest=path.join(target,'paper',file);fs.linkSync(path.join(paperDir,file),dest);const bytes=fs.readFileSync(dest);manifest.files.push({file:'paper/'+file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
}
