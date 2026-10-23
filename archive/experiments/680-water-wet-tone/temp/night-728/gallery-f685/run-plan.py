import os,json,subprocess,time,sys
from pathlib import Path
root=Path.cwd()
plan=json.loads((root/'temp/night-728/gallery-f685/render-plan.json').read_text())
output=root/'temp/night-728/gallery-f685/results';output.mkdir(exist_ok=True)
state={'source':plan['source'],'completed':[],'live':None,'terminal':False}
progress=output/'progress.json'
def save(): progress.write_text(json.dumps(state,indent=2))
env=dict(os.environ,APP_URL='https://localhost:5329',GALLERY_SOURCE_VERSION=plan['source'],GALLERY_NATIVE_BATCH='1',APP_STEP=str(plan['stepMs']),GALLERY_GPU_SLOT='granted',GALLERY_NODE_REQUIRE='/home/suselman/projects/pencil-agents/680-water-wet-tone-qa/package.json',DISPLAY=':0')
try:
 for item in plan['sheets']:
  png=output/('sheet'+item['sheet']+'.png')
  report_path=Path(str(png)+'.report.json')
  if png.exists() and report_path.exists():
   retained=json.loads(report_path.read_text())
   if retained['version']==plan['source'] and not retained['errors'] and not retained['gpu']['lost'] and not retained['gpu']['error']:
    state['completed'].append({'sheet':item['sheet'],'inputSHA':item['sha256'],'output':str(png),'report':str(report_path)});save();continue
  state['live']=item['sheet'];save()
  png=output/('sheet'+item['sheet']+'.png')
  with (output/('sheet'+item['sheet']+'.log')).open('wb') as log:
   code=subprocess.call(['/home/suselman/.nvm/versions/node/v22.20.0/bin/node',str(root/'temp/night-728/gallery-f685/render.mjs'),str(root/item['path']),str(png)],env=env,stdout=log,stderr=subprocess.STDOUT)
  if code: raise RuntimeError('Sheet'+item['sheet']+' exit'+str(code))
  report=json.loads(Path(str(png)+'.report.json').read_text())
  if report['errors'] or report['gpu']['lost'] or report['gpu']['error']: raise RuntimeError('GPU gate')
  state['completed'].append({'sheet':item['sheet'],'inputSHA':item['sha256'],'output':str(png),'report':str(png)+'.report.json'});save()
 state.update(live=None,terminal=True,success=True);save()
except BaseException as error:
 state.update(terminal=True,success=False,error=str(error));save();raise
