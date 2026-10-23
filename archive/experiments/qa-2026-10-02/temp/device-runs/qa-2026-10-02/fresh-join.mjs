import {chromium} from 'playwright';
import{ev,joinAndInstall}from'../../../apps/web/scripts/devices/bridge.mjs';
import{writeFileSync}from'node:fs';
const peers=[['laptop','wrunf2'],['ipad','ghtkzg'],['surface','kk7m7f']];
const report={checks:[]};const save=()=>writeFileSync(new URL('./fresh-join.json',import.meta.url),JSON.stringify(report,null,2));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.connectOverCDP('http://localhost:9333');const page=browser.contexts()[0].pages().find(p=>p.url().includes('5277'));await page.goto('https://localhost:5277/create');await page.locator('form input[type=text]').fill('QA692 join');await page.locator('form button[type=submit]').click();await page.waitForURL(/\/room\//);report.room=new URL(page.url()).pathname.split('/').pop();console.log('ROOM',report.room);await browser.close();
for(const[name,id]of peers){if(name!=='laptop')await ev(id,`__devNavigate('/room/${report.room}');return 'nav'`);await joinAndInstall(id,report.room);await ev(id,`const s=__roomStore.getState();s.setTool('watercolor');s.setToolSetting('watercolor','size',60);s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',0.7);return 'ready'`);}
console.log('JOIN PASS',report.room);save();
