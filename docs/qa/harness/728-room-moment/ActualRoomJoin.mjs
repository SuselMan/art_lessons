/** Same proven Room controller lifecycle: await engine OR Join, then real guest form. */
export async function joinActualRoom(page){
 await page.waitForFunction(()=>window.__engine||[...document.querySelectorAll('button')].some(b=>/Войти в проект|Join/.test(b.textContent)),null,{timeout:45000});
 if(!await page.evaluate(()=>!!window.__engine)){
  await page.locator('input[type=text]').first().fill('qa-batch2');
  await page.getByRole('button',{name:/Войти в проект|Join/}).click();
 }
}
