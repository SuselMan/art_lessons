from pathlib import Path
import shutil,json,re,os
root=Path.cwd(); dest=Path.home()/'.local/share/stroke-gallery/previews/logo-shavings-20261005';dest.mkdir(parents=True,exist_ok=True)
svg=(root/'apps/web/src/assets/logo.svg').read_text().replace('/brand/grafetto-g.png','./grafetto-g.png')
mark=re.sub(r'^[ \t]*<g id="logo-wordmark"[\s\S]*?</g>','',svg,flags=re.M)
mark=re.sub(r'viewBox="[^"]*"','viewBox="40 0 316 388"',mark,count=1)
shutil.copyfile(root/'apps/web/public/brand/grafetto-g.png',dest/'grafetto-g.png')
for p in (root/'apps/web/public').glob('*icon*.png'):shutil.copyfile(p,dest/p.name)
shutil.copyfile(root/'apps/web/public/favicon.svg',dest/'favicon.svg')
def panel(theme):
 return f'''<section class="panel {theme}"><h2>{'Тёмная' if theme=='dark' else 'Светлая'} тема</h2><div class="header"><span class="logo">{svg}</span><span class="nav">Настройки</span></div><div class="compact-header"><span class="small-logo">{mark}</span><span>Урок рисования</span><span class="menu">☰</span></div><div class="large"><span>{svg}</span></div></section>'''
html='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grafetto — новый логотип</title><link rel="icon" href="./favicon.svg"><style>
*{box-sizing:border-box}body{margin:0;background:#23232a;color:#f1f0f7;font:16px system-ui,sans-serif}main{max-width:1100px;margin:32px auto;padding:0 16px}h1{font-size:24px}h2{font-size:15px;margin:0;padding:20px;color:inherit;opacity:.65}.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{border-radius:16px;overflow:hidden}.dark{background:#19191c;color:#f0eee9}.light{background:#eeeef0;color:#15151c}.header,.compact-header{display:flex;align-items:center;gap:16px;padding:20px;border-bottom:1px solid #8883}.logo{height:40px;display:block}.logo svg,.small-logo svg,.large svg{height:100%;width:auto;display:block}.nav{margin-left:auto;font-size:13px}.compact-header{height:60px}.small-logo{height:28px;display:block}.menu{margin-left:auto}.large{padding:32px 20px}.large span{display:block;height:90px}.icons{display:flex;gap:24px;flex-wrap:wrap;align-items:center}.icons figure{margin:0}.icons img{width:96px;height:96px;object-fit:contain;border-radius:18px}.icons figcaption{font-size:12px;margin-top:8px;color:#bbb}.controls{display:flex;align-items:center;gap:12px;margin:24px 0}input{max-width:200px}footer{margin:24px 0;color:#b6b5bd;font-size:14px}@media(max-width:760px){.panels{grid-template-columns:1fr}.nav{display:none}.large span{height:75px}}
</style><main><h1>G из карандашной стружки</h1><div class="controls"><label for="size">Размер полного логотипа</label><input id="size" type="range" min="24" max="64" value="40"><output id="value">40 px</output></div><div class="panels">'''+panel('dark')+panel('light')+'''</div><h2>Иконки</h2><div class="icons">'''
for filename,caption in [('favicon-96.png','Вкладка браузера'),('apple-touch-icon.png','iPhone / iPad'),('icon-512.png','Приложение'),('icon-maskable-512.png','Android · круглая маска')]:
 style=' style="border-radius:50%"' if 'maskable' in filename else ''
 html+=f'<figure><img src="./{filename}"{style}><figcaption>{caption}</figcaption></figure>'
html+='''</div><footer>Полный и компактный варианты на светлом и тёмном фоне.</footer></main><script>const size=document.getElementById('size');size.oninput=()=>{document.querySelectorAll('.logo').forEach(el=>el.style.height=size.value+'px');document.getElementById('value').value=size.value+' px'}</script></html>'''
(dest/'index.html').write_text(html)
services_path=Path.home()/'.local/share/project-services/services.json';services=json.loads(services_path.read_text());gallery=next(s['url'] for s in services if s['name']=='Галерея мазков');url=gallery+'preview/logo-shavings-20261005/'
entry={'name':'Новый логотип Grafetto','description':'G из карандашной стружки: полный и компактный варианты, темы и иконки.','url':url}
services=[s for s in services if s['name']!=entry['name']]+[entry]
tmp=services_path.with_suffix('.tmp');tmp.write_text(json.dumps(services,ensure_ascii=False,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(services_path)
(root/'temp/logo-qa/shavings-preview-url').write_text(url)
print(url)
