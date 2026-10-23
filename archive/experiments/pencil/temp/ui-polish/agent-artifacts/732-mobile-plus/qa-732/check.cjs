const fs = require('node:fs');
const { chromium } = require('/home/suselman/projects/pencil/node_modules/@playwright/test');
(async () => {
 const browser = await chromium.launch({ headless: true });
 const page = await browser.newPage();
 const css = fs.readFileSync('apps/web/src/pages/MyLessons/MyLessons.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1');
 const tokens = fs.readFileSync('apps/web/src/styles/tokens.css', 'utf8');
 const results = [];
 for (const width of [320, 390, 600, 601, 1024]) {
  await page.setViewportSize({ width, height: 500 });
  await page.setContent(`<style>${tokens}\n*{box-sizing:border-box}body{margin:0;background:var(--color-bg)}${css}</style><div class="page"><div class="titleRow"><div class="searchRow" style="min-width:0"><input style="width:100%" placeholder="Search projects"/></div><div class="viewToggle"><button class="viewButton">▤</button><button class="viewButton">▦</button></div><a href="/create" class="newRoomLink" aria-label="New project"><span aria-hidden="true">+</span><span class="newRoomLabel">New project</span></a></div></div>`);
  await page.getByRole('link', { name: 'New project' }).waitFor();
  const result = await page.locator('.newRoomLink').evaluate(el => ({ label: getComputedStyle(el.querySelector('.newRoomLabel')).display, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
  if ((width <= 600) !== (result.label === 'none') || result.width < 40 || result.height < 40) throw new Error(JSON.stringify(result));
  await page.screenshot({ path: `temp/qa-732/button-${width}.png` });
  results.push({ viewport: width, ...result });
 }
 fs.writeFileSync('temp/qa-732/results.json', JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results, null, 2));
 await browser.close();
})();
