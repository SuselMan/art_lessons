import{writeFileSync}from'node:fs';
const origin='http://127.0.0.1:5325',queue=['/src/engine/index.ts','/src/engine/src/buffers/AccumulationBuffer.ts'],seen=new Set(),report=[];
while(queue.length&&seen.size<1200){const path=queue.shift();if(seen.has(path))continue;seen.add(path);const r=await fetch(origin+path),body=await r.text();report.push({path,status:r.status,type:r.headers.get('content-type')});if(!r.ok)break;
 for(const match of body.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)){const p=match[1];if(p.startsWith('/')&&!p.startsWith('//'))queue.push(p);}
}
writeFileSync('temp/onset/module-preflight.json',JSON.stringify({count:seen.size,remaining:queue.length,failures:report.filter(r=>r.status!==200),requests:report},null,2));console.log(JSON.stringify({count:seen.size,remaining:queue.length,failures:report.filter(r=>r.status!==200)}));if(report.some(r=>r.status!==200))process.exitCode=1;
