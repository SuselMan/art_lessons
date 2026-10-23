import{chromium}from'playwright';import{ev,joinAndInstall}from'../../../apps/web/scripts/devices/bridge.mjs';import{writeFileSync}from'node:fs';
const b=await chromium.connectOverCDP('http://127.0.0.1:9333');let room;
try{const p=b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes(':5288/room/'));await p.goto('https://localhost:5288/create');await p.locator('form input[type="text"]').first().fill('QA 691 702 fresh GPU parity');await p.locator('form button[type="submit"]').click();await p.waitForURL(/\/room\/[^/]+$/);room=new URL(p.url()).pathname.split('/').pop();await p.waitForFunction(()=>window.__engine&&document.querySelector('canvas')&&getComputedStyle(document.querySelector('canvas')).pointerEvents!=='none');}finally{await b.close();}
for(const id of ['5sdfa7','quyopf'])await ev(id,`setTimeout(()=>location.href='/room/${room}',300);return 'scheduled'`);
for(const id of ['uqqucb','5sdfa7','quyopf'])await joinAndInstall(id,room);
writeFileSync(new URL('fresh-room.json',import.meta.url),JSON.stringify({room}));console.log('READY',room);
