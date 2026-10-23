import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.env.WC_RELEASE_ROOT,APP=process.env.APP_URL,OUT=process.env.WC_QA_OUT;
if(!ROOT||!APP||!OUT)throw Error('Explicit isolated runtime/URL/output required');
const fn=readFileSync(new URL('./packed-mask-function.js',import.meta.url),'utf8');new Function('return '+fn);
const manifest=JSON.parse(readFileSync(new URL('./packed-cb-manifest.json',import.meta.url),'utf8'));
const{chromium}=createRequire(ROOT+'/package.json')('playwright');mkdirSync(OUT,{recursive:true});
const report={manifest,errors:[],scope:'mask primitive plus single carry64; no full solver/Room/perf assertion'};
const save=()=>writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));let browser,monitor;
const deadline=setTimeout(()=>{report.timeout=true;save();void browser?.close()},180000);
try{
 for(const file of manifest.files){const actual=createHash('sha256').update(readFileSync(ROOT+'/'+file.path)).digest('hex');if(actual!==file.candidateSHA)throw Error('Runtime source mismatch '+file.path)}
 report.runtimeSourceVerified=true;
 const memory=Number(readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;report.memAvailableMiB=memory;if(memory<1700)throw Error('Preflight RAM guard');
 monitor=setInterval(()=>{const available=Number(readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])/1024;report.latestMemAvailableMiB=available;if(available<500){report.memoryAbort=true;save();void browser?.close()}},5000);
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(APP+'/cost-domain.html?qa=cost-domain-'+Date.now());report.stage='primitive';save();
 report.result=await page.evaluate('('+fn+')('+JSON.stringify({source:manifest.base,net:manifest.netCommit})+')');save();
 if(report.result.error||report.result.gl||report.result.lost||report.result.comparisons!==722400||report.result.subrectComparisons!==722400||report.result.carryCases!==14||report.result.packCases!==14||report.result.unormCodes!==256||!report.result.completed||!report.result.immutableInputs)throw Error('Primitive correctness/GL guard');
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1}finally{clearTimeout(deadline);clearInterval(monitor);if(browser)await browser.close();report.ownedChromeClosed=true;save()}
