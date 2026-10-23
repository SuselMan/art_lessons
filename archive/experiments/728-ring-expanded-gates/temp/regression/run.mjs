import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const ROOT=process.env.WC_RELEASE_ROOT,APP=process.env.APP_URL,OUT=process.env.WC_QA_OUT;
if(!ROOT||!APP||!OUT)throw Error('explicit paths required');
const fn=readFileSync(new URL('./probe.js',import.meta.url),'utf8');new Function('return '+fn);
const passport=JSON.parse(readFileSync(ROOT+'/source-passport.json','utf8'));
for(const v of passport.versions)for(const[file,expected]of Object.entries(v.files))if(createHash('sha256').update(readFileSync(ROOT+'/sources/'+v.name+'/'+file)).digest('hex')!==expected)throw Error('source changed '+v.name+'/'+file);
const build=JSON.parse(readFileSync(ROOT+'/build-passport.json','utf8'));for(const[v,b]of Object.entries(build.bundles))if(createHash('sha256').update(readFileSync(ROOT+'/bundles/'+v+'.mjs')).digest('hex')!==b.SHA256)throw Error('bundle changed '+v);
const raw=readFileSync(ROOT+'/ops_3.json');if(createHash('sha256').update(raw).digest('hex')!==passport.journalSHA256)throw Error('journal changed');
const all=JSON.parse(raw),ops=all.filter(o=>o.type!=='image_import');if(all.length!==42||ops.length!==41)throw Error('fixture count');
for(const o of ops)if(o.type==='stroke'&&(!Array.isArray(o.color)||!o.dabsPacked?.startsWith('1:')||JSON.stringify(o).includes('[cycle]')))throw Error('payload invalid');
const arms=JSON.parse(process.env.WC_ARMS??'[{"revision":"0a78ab53","policy":"DEFAULT"},{"revision":"c1997fee","policy":"DEFAULT"},{"revision":"c1997fee","policy":"REVIEW"}]');
for(const a of arms)if(!passport.versions.some(v=>v.name===a.revision)||!['DEFAULT','REVIEW'].includes(a.policy))throw Error('unknown arm');
if(process.env.WC_DRY_RUN==='1'){console.log(JSON.stringify({compiled:true,sourceVerified:true,journalSHA:passport.journalSHA256,arms,ops:ops.length}));process.exit(0)}
if(process.env.WC_GPU_SLOT!=='granted')throw Error('GPU grant required');
const require=createRequire(process.env.WC_DEPS_ROOT+'/package.json'),{chromium}=require('playwright');
const {PNG}=require(require.resolve('playwright-core/package.json').replace('/package.json','/lib/utilsBundle.js'));
mkdirSync(OUT,{recursive:true});let browser,timer,progress;
const report={build,source:passport,journalSHA:passport.journalSHA256,excludedImageIds:all.filter(o=>o.type==='image_import').map(o=>o.id),arms:[],errors:[],scope:'historical full-source default/review contrast, same packed journal; image excluded explicitly'};
const save=()=>writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));
const mem=()=>Number(readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;
function metrics(file){const a=PNG.sync.read(readFileSync(file));let count=0;const alphaSum=[0,0,0,0],premultSum=[0,0,0];for(let i=0;i<a.data.length;i+=4){for(let c=0;c<4;c++)alphaSum[c]+=a.data[i+c];if(a.data[i+3])count++;for(let c=0;c<3;c++)premultSum[c]+=a.data[i+c]*a.data[i+3]/255}return {width:a.width,height:a.height,nonzeroAlpha:count,channelSum:alphaSum,premultSum,rgbaSHA:createHash('sha256').update(a.data).digest('hex')}}
try {
  report.preflightMiB=mem();if(report.preflightMiB<1700)throw Error('RAM preflight');
  timer=setTimeout(()=>{report.timeout=true;save();void browser?.close().finally(()=>process.exit(124))},Number(process.env.WC_WALL_MS??900000));
  browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'},args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(APP+'/regression.html');
  progress=setInterval(async()=>{try{report.progress=await page.evaluate(()=>window.__regressionProgress);report.memAvailableMiB=mem();save();if(report.memAvailableMiB<500){report.ramAbort=true;await browser.close()}}catch{}},5000);
  for(const a of arms){report.stage=a;save();const input={...a,moduleURL:APP+'/bundles/'+a.revision+'.mjs',ops,operationTimeout:180000};
    const row=await page.evaluate(({fn,input})=>new Function('return '+fn)()(input),{fn,input});report.arms.push(row);
    for(const k of ['preDryPNG','finalPNG','transparentPNG'])if(row[k]){const name=a.revision+'-'+a.policy+'-'+k+'.png';writeFileSync(OUT+'/'+name,Buffer.from(row[k],'base64'));row[k]={file:name,...metrics(OUT+'/'+name)}}
    save();if(!row.completed||!row.engineClosed||row.gpu?.gl||row.gpu?.lost||!row.transparentPNG?.nonzeroAlpha||!row.material?.some(x=>x.name==='inkLoad'&&x.nonzero)||!row.material?.some(x=>x.name==='inkColor'&&x.nonzero))throw Error(row.error??'nonempty/GL/lifecycle failed');
    if(row.finalPNG.width!==3508||row.finalPNG.height!==2480)throw Error('physical dimensions failed');
  }
  report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1}
finally{clearInterval(progress);clearTimeout(timer);await browser?.close();report.ownedChromeClosed=true;save()}
console.log(JSON.stringify({completed:report.completed,closed:report.ownedChromeClosed,error:report.error}));
