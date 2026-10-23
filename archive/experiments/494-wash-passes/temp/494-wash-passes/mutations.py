from pathlib import Path
import subprocess,os,json
root=Path('temp/494-wash-passes');p=Path('apps/web/src/engine/src/raster/WatercolorPasses.ts');original=p.read_text();env=os.environ|{'E2E_PORT_OFFSET':'234'}
def run(config,label,log):
 with (root/log).open('w') as out:
  return subprocess.run(['npx','playwright','test','--config',str(root/config),'--project','chromium'],env=env|{'AB_LABEL':label},stdout=out,stderr=subprocess.STDOUT).returncode
if run('primitive.config.ts','before','primitive-before.log')!=0:raise SystemExit('baseline primitive test failed')
if run('primitive.config.ts','after','primitive-after.log')!=0:raise SystemExit('primitive positive test failed')
results={}
try:
 for name,old,new,config,reason in [
  ('field-factor','gl.uniform1f(u.u_k, k)','gl.uniform1f(u.u_k, k + 0.1)','primitive.config.ts','.toEqual'),
  ('program-release','    this.gl.deleteProgram(this._fieldOpProg)','    // controlled omission of program release','lifetime.config.ts','watercolor GPU resource retained after destroy')]:
  if old not in original:raise RuntimeError('mutation target missing')
  p.write_text(original.replace(old,new,1))
  code=run(config,'after','mutation-'+name+'.log')
  log=(root/('mutation-'+name+'.log')).read_text()
  if code==0 or reason not in log:raise RuntimeError('mutation was not caught: '+name)
  results[name]={'exit':code,'caught':reason}
  p.write_text(original)
finally:p.write_text(original)
(root/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
