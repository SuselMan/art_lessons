const fs = require('node:fs');
const { chromium } = require('/home/suselman/projects/pencil/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const css = fs.readFileSync('apps/web/src/pages/MyLessons/MyLessons.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1');
  const tokens = fs.readFileSync('apps/web/src/styles/tokens.css', 'utf8');
  const card = (name) => `<div class="card"><a class="cardLink"><div class="cardThumbnailPlaceholder">✎</div><div class="cardText"><div class="cardName">${name}</div><div class="cardMeta"><span>Teacher</span><span>·</span><span>Oct 7, 2026</span><span>Closed</span></div></div></a></div>`;
  const folder = '<div class="folderCard"><button class="folderOpenButton"><div class="folderIconArea">📁</div><div class="folderName">Длинное имя папки с рисунками</div></button></div>';
  const results = [];
  for (const width of [320, 360, 390, 600, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.setContent(`<style>${tokens}\n*{box-sizing:border-box}body{margin:0;background:var(--color-bg);font-family:Arial}button{border:0;color:inherit;background:transparent}${css}</style><div class="page"><section class="section"><div class="grid">${card('Портрет карандашом')}${card('ОченьДлинноеНеразрывноеНазваниеПроекта')}${folder}${card('Натюрморт')}</div></section></div>`);
    const result = await page.evaluate(() => ({ viewport: innerWidth, columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth, firstWidth: document.querySelector('.card').getBoundingClientRect().width }));
    if (result.overflow || (width <= 600 && result.columns !== 2)) throw new Error(JSON.stringify(result));
    await page.screenshot({ path: `temp/qa-729/grid-${width}.png`, fullPage: true });
    results.push(result);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('.grid').evaluate(el => el.className = 'list');
  const list = await page.evaluate(() => ({ display: getComputedStyle(document.querySelector('.list')).display, direction: getComputedStyle(document.querySelector('.list')).flexDirection }));
  if (list.display !== 'flex' || list.direction !== 'column') throw new Error(JSON.stringify(list));
  fs.writeFileSync('temp/qa-729/results.json', JSON.stringify({ grid: results, list }, null, 2));
  console.log(JSON.stringify({ grid: results, list }, null, 2));
  await browser.close();
})();
