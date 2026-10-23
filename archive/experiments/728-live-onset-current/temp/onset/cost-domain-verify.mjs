import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const root=process.argv[2],manifest=JSON.parse(readFileSync(root+'/temp/onset/cost-domain-whole-manifest.json'));
for(const f of manifest.files){const sha=createHash('sha256').update(readFileSync(root+'/'+f.path)).digest('hex');if(sha!==f.sha256)throw Error('Source mismatch '+f.path)}
const passport={base:manifest.base,net:manifest.net,verifiedSourceFiles:manifest.files.length,at:new Date().toISOString(),scope:'new own runtime; old onset preserved; GPU not started'};
writeFileSync(root+'/temp/onset/source-passport.txt',JSON.stringify(passport,null,2));console.log(JSON.stringify(passport));
