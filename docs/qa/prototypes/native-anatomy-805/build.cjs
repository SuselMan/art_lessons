'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('./anatomy-model.js');
function build(dataPath,outputPath){
 const source=path.resolve(dataPath),data=validate(JSON.parse(fs.readFileSync(source,'utf8'))),output=path.resolve(outputPath),root=path.dirname(source);
 const images=data.scenes.flatMap(s=>[s.initial,s.final,...s.tracks.flatMap(t=>t.stages.flatMap(n=>[n.beforeImage,n.afterImage]))].filter(Boolean));
 for(const image of images){const full=path.resolve(root,image.src);if(!full.startsWith(root+path.sep))throw Error('Image escapes data directory');const payload=fs.readFileSync(full);if(crypto.createHash('sha256').update(payload).digest('hex')!==image.sha256)throw Error('Image SHA mismatch: '+image.src)}
 let html=fs.readFileSync(path.join(__dirname,'anatomy.html'),'utf8');
 html=html.replace('{"schemaVersion":1,"scenes":[]}',JSON.stringify(data).replace(/</g,'\\u003c')).replace('<script src="anatomy-model.js"></script>','<script>'+fs.readFileSync(path.join(__dirname,'anatomy-model.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 for(const image of images){const from=path.resolve(root,image.src),to=path.resolve(path.dirname(output),image.src);if(from===to)continue;fs.mkdirSync(path.dirname(to),{recursive:true});if(fs.existsSync(to)){if(crypto.createHash('sha256').update(fs.readFileSync(to)).digest('hex')!==image.sha256)throw Error('Output image collision')}else fs.linkSync(from,to)}
 const pending=output+'.pending';fs.writeFileSync(pending,html);fs.renameSync(pending,output);return{scenes:data.scenes.length,images:images.length,htmlSHA256:crypto.createHash('sha256').update(html).digest('hex')};
}
if(require.main===module){if(process.argv.length!==4)throw Error('Usage: node build.cjs data.json output/anatomy.html');console.log(JSON.stringify(build(process.argv[2],process.argv[3])))}
module.exports={build};
