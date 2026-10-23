import { chromium, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRoom, waitForRoomReady } from '../../e2e/support/room'
async function main(){
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const page=await browser.newPage({baseURL:'https://tools.pecni.com',viewport:{width:1400,height:900}})
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
const url=readFileSync('/home/suselman/.local/share/project-services/grafetto-logo/url','utf8').trim()
await page.goto(url);await page.waitForLoadState('networkidle')
await expect(page.getByRole('img',{name:'Grafetto',exact:true})).toBeVisible()
await page.screenshot({path:'temp/logo-qa/live-stand-home.png'})
await page.addInitScript(()=>localStorage.setItem('al_locale','en'))
await createRoom(page,'Проверка новой G');await waitForRoomReady(page)

await page.screenshot({path:'temp/logo-qa/live-stand-room.png'})
await page.setViewportSize({width:390,height:844})
await expect(page.locator('[role="img"][aria-label="Grafetto"] #logo-wordmark')).toHaveCount(0)
await page.screenshot({path:'temp/logo-qa/live-stand-mobile.png'})
if(errors.length)throw Error(errors.join('\n'))
writeFileSync('temp/logo-qa/live-stand-check.log','HTTPS app, room creation, live socket, full/compact logo, no page errors: OK\n')
await browser.close()

}
main().catch(error=>{console.error(error);process.exit(1)})
