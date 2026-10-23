import json,pathlib,shutil,os,fcntl
base=pathlib.Path.home()/'.local/share/stroke-gallery';work=pathlib.Path(__file__).parent;version='8aa7e9f0-rooms-20261006';name='gallery-'+version;dest=base/'previews'/name;stage=base/'previews'/('.stage-'+name)
if dest.exists():raise RuntimeError('immutable preview already exists')
with (base/'update.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 current=(base/'current').resolve()/'docs/reference/strokes'
 shutil.copytree(current,stage,copy_function=os.link,symlinks=True)
 # Do not modify hardlinked archives when replacing metadata.
 for name0 in ['archive.json','archive.js']: (stage/name0).unlink()
 assets=work/'new-assets'
 for source in assets.rglob('*'):
  if not source.is_file():continue
  target=stage/source.relative_to(assets);target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists():target.unlink()
  shutil.copy2(source,target)
 board=pathlib.Path(__file__).resolve().parents[2]/'docs/reference/strokes/boards/12.jpg'
 if board.exists():
  target=stage/'boards/12.jpg';target.unlink(missing_ok=True);shutil.copy2(board,target)
 archive=json.loads((stage/'archive.json').read_text())
 for sheet in archive['sheets']:
  for stroke in sheet['strokes']:
   for frame in [*stroke.get('wet',[]),stroke.get('dry'),*stroke.get('app',{}).values()]:
    if frame and not (stage/frame['src']).is_file():raise RuntimeError('missing '+frame['src'])
 index=stage/'index.html';text=index.read_text().replace("fetch('comments'","fetch('../../comments'");index.unlink();index.write_text(text)
 stage.rename(dest)
 overlay={'versions':[v for v in archive['versions'] if v['id']==version],'sheets':[]}
 for sheet in archive['sheets']:
  row={'id':sheet['id'],'strokes':[]}
  for stroke in sheet['strokes']:
   frame=stroke.get('app',{}).get(version)
   if frame:row['strokes'].append({'n':stroke['n'],'app':{version:{**frame,'src':'preview/'+name+'/'+frame['src']}}})
  if row['strokes']:overlay['sheets'].append(row)
 prior=base/'data/rendered.json'
 if prior.exists():
  old=json.loads(prior.read_text());old['versions']+=overlay['versions'];old['sheets']+=overlay['sheets'];overlay=old
 tmp=base/'data/rendered.json.tmp';tmp.write_text(json.dumps(overlay,ensure_ascii=False,indent=1)+'\n');os.replace(tmp,prior)
 print(json.dumps({'preview':str(dest),'version':version,'sheets':len(overlay['sheets']),'crops':sum(len(s['strokes']) for s in overlay['sheets'])}))
